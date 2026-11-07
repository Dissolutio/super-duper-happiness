// Lenses for the map: ways of looking at the same universe. The button on the map cycles through them.
//   What matters : us, the second alliance, active players that count (the default, see isRelevant in map.js)
//   Everyone     : every player
//   Big fleets   : players whose points are mostly fleet, ranked by fleet share of their total points
//   Ripe targets : the same idea plus other signs that a player is easy to crash (see ripeness below)
// The two hunting lenses show the best TARGETS_SHOWN players; DONUT stays on the map, dimmed, for reference.
//
// Numbers come from the game's daily highscore files (world.stats, loaded in flight.js): total, economy, research, military.
// Military points include defence as well as ships, so a high fleet share can also be a turtle. Cutoffs are not fixed numbers:
// everything is ranked against the other players in the universe, so it adapts as the server grows.
// Needs map.js (mapPlanets, sysDistance, weakestOurs), flight.js (world) and app.js (ALLIES).

const LENSES = [
  { key: 'relevant', icon: '\u{1F441}', name: 'What matters', note: 'DONUT, the second alliance and active players that count' },
  { key: 'everyone', icon: '\u{1F310}', name: 'Everyone', note: 'every player in the universe' },
  { key: 'fleets', icon: '\u{1F680}', name: 'Big fleets', note: 'big fleets that are most of the account, worth crashing. Hotter = better' },
  { key: 'ripe', icon: '\u{1F3AF}', name: 'Ripe targets', note: 'big fleet, little research, no alliance, inactive or close to us. Hotter = riper' },
  { key: 'anywhere', icon: '\u{1F30C}', name: 'Ripe anywhere', note: 'the same, but distance from us does not count: for choosing where to put a new planet' },
]
const TARGETS_SHOWN = 40

// "1.2M", "340K", "820"
function shortNum(n) {
  if (!(n >= 0)) return '?'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K'
  return String(Math.round(n))
}
const pctText = (x) => `${Math.round(x * 100)}%`

// fleet / research / economy as a share of a player's total points, or null if the files did not load
function playerStats(id) {
  const s = world.stats?.get(id)
  if (!s || !(s.total > 0)) return null
  return { ...s, fleetShare: (s.mil ?? 0) / s.total, resShare: (s.res ?? 0) / s.total, ecoShare: (s.eco ?? 0) / s.total }
}

// one line for the planet sheet: "2.1M points · fleet 58% · research 9% · economy 33%"
function statsLine(id) {
  const s = playerStats(id)
  return s ? `${shortNum(s.total)} points · fleet ${pctText(s.fleetShare)} (${shortNum(s.mil ?? 0)}) · research ${pctText(s.resShare)} · economy ${pctText(s.ecoShare)}` : ''
}

const SCAN_MAX_AGE = 14 * 864e5 // older scans say little about a fleet that moves

// "3h", "2d"
function ageText(at) {
  const h = (Date.now() - at) / 36e5
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`
}

// What spy reports saw on a player's planets (recent ones only), added up: { fleet, defense, shipShare, newest, n } or null.
// shipShare = ships / (ships + defence) on what we scanned. Only what stood on those planets: ships in flight or on other planets are unseen.
function scanOf(id) {
  const rows = (MAP.scans?.get(String(id)) ?? []).filter((x) => Date.now() - x.at < SCAN_MAX_AGE)
  if (!rows.length) return null
  const fleet = rows.reduce((a, x) => a + x.fleet, 0), defense = rows.reduce((a, x) => a + x.defense, 0)
  if (fleet + defense <= 0) return null
  return { fleet, defense, shipShare: fleet / (fleet + defense), newest: Math.max(...rows.map((x) => x.at)), n: rows.length }
}

// fraction of the values that are below v (0 = lowest, close to 1 = highest)
function percentileOf(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return (v) => {
    let lo = 0, hi = sorted.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m }
    return sorted.length > 1 ? lo / (sorted.length - 1) : 0
  }
}

// how many systems the player's nearest planet is from any DONUT planet in the same galaxy (Infinity = not in a galaxy of ours)
function systemsFromUs(id, oursByGalaxy) {
  let best = Infinity
  for (const pl of world.byPlayer.get(id) ?? []) {
    const [g, s] = pl.coords.split(':').map(Number)
    for (const os of oursByGalaxy.get(g) ?? []) best = Math.min(best, sysDistance(os, s))
  }
  return best
}

// A target must be worth the trip: its fleet (military points, times the ships share if we scanned it) has to be at least
// MIN_FLEET_VS_US of a typical DONUT member's military, and its total at least MIN_TOTAL_VS_US of a typical DONUT total.
// That weeds out new and tiny players whose points happen to be mostly ships. Tune here.
const MIN_FLEET_VS_US = 0.25
const MIN_TOTAL_VS_US = 0.25

const median = (xs) => { const v = xs.filter((x) => x > 0).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0 }
// a typical DONUT member: median total and military points
function ourTypical() {
  if (MAP.typical?.world === world) return MAP.typical
  const ours = world.players.filter((p) => p.alliance && p.alliance.toLowerCase() === ALLIES[0].toLowerCase()).map((p) => world.stats?.get(p.id) ?? {})
  MAP.typical = { world, total: median(ours.map((s) => s.total)), mil: median(ours.map((s) => s.mil)) }
  return MAP.typical
}
// estimated fleet points: military points, minus the defence share if a recent scan told us
function fleetPoints(s, scan) { return (s.mil ?? 0) * (scan ? scan.shipShare : 1) }

// Who could we hit? Not us, not on vacation or banned (the game will not let us), and big enough to be worth it (see above).
function huntPool() {
  const us = ourTypical()
  const floor = Number.isFinite(weakestOurs()) ? weakestOurs() : 0
  return world.players.filter((p) => {
    if (p.alliance && p.alliance.toLowerCase() === ALLIES[0].toLowerCase()) return false
    if (/[vb]/.test(p.status ?? '')) return false
    const s = playerStats(p.id)
    if (!s || !(world.byPlayer.get(p.id)?.length > 0) || s.total < floor) return false
    if (us.total > 0 && s.total < us.total * MIN_TOTAL_VS_US) return false
    if (us.mil > 0 && fleetPoints(s, scanOf(p.id)) < us.mil * MIN_FLEET_VS_US) return false
    return true
  })
}

// The ranked targets for a hunting lens: Map playerId -> { rank (0 = best), bucket (5 hottest .. 1), score 0..1, why: [text] }
// Cached until the lens or the loaded universe changes.
function huntBoard(lensKey) {
  if (MAP.board?.key === lensKey && MAP.board.world === world) return MAP.board.map
  const pool = huntPool()
  const stats = new Map(pool.map((p) => {
    const s = playerStats(p.id)
    // Military points are ships plus defence. If we have scanned them, count only the ships' share: a turtle drops down, a fleeter stays.
    const sc = scanOf(p.id)
    return [p.id, { ...s, scan: sc, fleetShare: sc ? s.fleetShare * sc.shipShare : s.fleetShare, fleetPts: fleetPoints(s, sc) }]
  }))
  const sizePct = percentileOf(pool.map((p) => stats.get(p.id).fleetPts))
  const us = ourTypical()
  const fleetPct = percentileOf(pool.map((p) => stats.get(p.id).fleetShare))
  const resPct = percentileOf(pool.map((p) => stats.get(p.id).resShare))
  const oursByGalaxy = new Map()
  for (const x of mapPlanets()) {
    if (mapSide(x.owner) !== 0) continue
    if (!oursByGalaxy.has(x.g)) oursByGalaxy.set(x.g, [])
    oursByGalaxy.get(x.g).push(x.s)
  }
  const rows = pool.map((p) => {
    const s = stats.get(p.id)
    const away = systemsFromUs(p.id, oursByGalaxy)
    const idle = /[iI]/.test(p.status ?? '')
    const fleet = fleetPct(s.fleetShare), size = sizePct(s.fleetPts), neglect = 1 - resPct(s.resShare)
    const near = Number.isFinite(away) ? 1 - Math.min(away, 80) / 80 : 0
    // ripeness: the fleet matters most (how big, and how much of the account it is), then being close to us,
    // then the other weaknesses (weights add up to 1)
    // ...and the same without distance, for surveying the whole universe (weights add up to 1)
    const anywhere = 0.3 * size + 0.3 * fleet + 0.15 * neglect + 0.125 * (p.alliance ? 0 : 1) + 0.125 * (idle ? 1 : 0)
    const ripe = 0.25 * size + 0.25 * fleet + 0.2 * near + 0.1 * neglect + 0.1 * (p.alliance ? 0 : 1) + 0.1 * (idle ? 1 : 0)
    const why = [s.scan ? `ships about ${pctText(s.fleetShare)} of points (military ${pctText(s.mil / s.total)}, ${pctText(s.scan.shipShare)} of it ships when scanned ${ageText(s.scan.newest)} ago)` : `fleet ${pctText(s.fleetShare)} of points (${shortNum(s.mil ?? 0)}, may include defence)`]
    if (us.mil > 0) why.push(`fleet about ${(s.fleetPts / us.mil).toFixed(s.fleetPts < us.mil ? 1 : 0)}x a typical ${ALLIES[0]} military`)
    if (s.scan && s.scan.shipShare < 0.4) why.push('turtle: mostly defence when scanned')
    if (neglect > 0.7) why.push(`research only ${pctText(s.resShare)}`)
    if (!p.alliance) why.push('no alliance to defend them')
    if (idle) why.push('inactive, so no one is watching the fleet')
    if (lensKey !== 'anywhere' && Number.isFinite(away) && away <= 40) why.push(away === 0 ? 'next to one of our planets' : `${away} systems from our nearest planet`)
    return { id: p.id, score: lensKey === 'ripe' ? ripe : lensKey === 'anywhere' ? anywhere : 0.5 * fleet + 0.5 * size + s.fleetShare * 1e-3, why }
  })
  rows.sort((a, b) => b.score - a.score)
  const map = new Map()
  rows.slice(0, TARGETS_SHOWN).forEach((r, i) => {
    map.set(r.id, { rank: i, score: r.score, bucket: i < 5 ? 5 : i < 15 ? 4 : i < 25 ? 3 : i < 33 ? 2 : 1, why: r.why })
  })
  MAP.board = { key: lensKey, world, map }
  return map
}

// the board for the current lens, or null for the two plain lenses
const currentBoard = () => (MAP.lens >= 2 ? huntBoard(LENSES[MAP.lens].key) : null)
