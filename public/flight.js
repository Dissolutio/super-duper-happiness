// Flight times for this universe. Pure maths, no screen code; the formulas were checked against real in-game times (see README).
//   seconds = round( (10 + 3500 / speedFraction * sqrt(10 * distance / shipSpeed)) / fleetFactor )
// A fleet flies at the speed of its SLOWEST ship, so the calculator takes one ship.
// Needs nothing else; getXml() from app.js is used only by loadWorld().

const DRIVE_PER_LEVEL = { comb: 0.1, imp: 0.2, hyper: 0.3 }

// steps: [drive, base speed, minimum drive level to switch to this step]. The last step whose level is reached is used.
const SHIPS = [
  { id: 210, name: 'Espionage Probe', steps: [['comb', 100000000]] },
  { id: 206, name: 'Cruiser', steps: [['imp', 15000]] },
  { id: 204, name: 'Light Fighter', steps: [['comb', 12500]] },
  { id: 219, name: 'Pathfinder', steps: [['hyper', 10000]] },
  { id: 205, name: 'Heavy Fighter', steps: [['imp', 10000]] },
  { id: 207, name: 'Battleship', steps: [['hyper', 10000]] },
  { id: 215, name: 'Battlecruiser', steps: [['hyper', 10000]] },
  { id: 203, name: 'Large Cargo', steps: [['comb', 7500]] },
  { id: 218, name: 'Reaper', steps: [['hyper', 7000]] },
  { id: 202, name: 'Small Cargo', steps: [['comb', 5000], ['imp', 10000, 5]] },
  { id: 213, name: 'Destroyer', steps: [['hyper', 5000]] },
  { id: 211, name: 'Bomber', steps: [['imp', 4000], ['hyper', 5000, 8]] },
  { id: 208, name: 'Colony Ship', steps: [['imp', 2500]] },
  { id: 209, name: 'Recycler', steps: [['comb', 2000], ['imp', 4000, 17], ['hyper', 6000, 15]] },
  { id: 214, name: 'Deathstar', steps: [['hyper', 100]] },
]

// tech = { comb, imp, hyper } drive levels; lfPct = this ship's lifeform speed bonus in percent (adds to the drive bonus)
function shipSpeed(ship, tech, lfPct = 0) {
  let [drive, base] = ship.steps[0]
  for (const [d, b, minLevel] of ship.steps.slice(1)) if ((tech[d] ?? 0) >= minLevel) [drive, base] = [d, b]
  return base * (1 + (tech[drive] ?? 0) * DRIVE_PER_LEVEL[drive] + lfPct / 100)
}

// ---- the universe: who owns what, which systems count when flying through ----
// All three XML documents come from the OGame API (universe.xml weekly, players.xml daily, serverData.xml static).
function buildWorld(universe, players, serverData, alliances) {
  const num = (tag, fallback) => Number(serverData.querySelector(tag)?.textContent ?? fallback)
  const tagOf = {} // alliance id -> tag
  const allianceList = []
  for (const a of alliances?.querySelectorAll('alliance') ?? []) {
    tagOf[a.getAttribute('id')] = a.getAttribute('tag')
    allianceList.push({ id: a.getAttribute('id'), name: a.getAttribute('name'), tag: a.getAttribute('tag') })
  }
  const status = {}
  for (const p of players.querySelectorAll('player')) status[p.getAttribute('id')] = p.getAttribute('status') ?? ''
  const world = {
    galaxies: num('galaxies', 7), systems: num('systems', 499),
    donutGalaxy: num('donutGalaxy', 1) === 1, donutSystem: num('donutSystem', 1) === 1,
    ignoreEmpty: num('fleetIgnoreEmptySystems', 0) === 1, ignoreInactive: num('fleetIgnoreInactiveSystems', 0) === 1,
    factor: { peaceful: num('speedFleetPeaceful', 1), war: num('speedFleetWar', 1) },
    sys: new Map(), // "g:s" -> { planets, active }
    byPlayer: new Map(), // player id -> [{ coords, name, moon, pid }]
    alliances: allianceList, // [{ id, name, tag }]
    at: new Map(), // "g:s:p" -> owner player id
    players: [...players.querySelectorAll('player')].map((p) => ({
      id: p.getAttribute('id'), name: p.getAttribute('name'), status: p.getAttribute('status') ?? '', alliance: tagOf[p.getAttribute('alliance')] ?? '',
    })),
  }
  for (const pl of universe.querySelectorAll('planet')) {
    const owner = pl.getAttribute('player'), coords = pl.getAttribute('coords')
    const key = coords.split(':').slice(0, 2).join(':')
    const s = world.sys.get(key) ?? { planets: 0, active: 0 }
    s.planets++
    if (!/[iI]/.test(status[owner] ?? '')) s.active++ // i / I = inactive; vacation alone still counts
    world.sys.set(key, s)
    world.at.set(coords, owner)
    if (!world.byPlayer.has(owner)) world.byPlayer.set(owner, [])
    world.byPlayer.get(owner).push({ coords, name: pl.getAttribute('name'), moon: !!pl.querySelector('moon'), pid: Number(pl.getAttribute('id')) })
  }
  world.byId = new Map(world.players.map((p) => [p.id, p]))
  return world
}

// who owns the planet or moon at these coordinates ("1:98:5"), or undefined: { id, name, status, alliance }
const ownerAt = (world, coords) => world.byId.get(world.at.get(coords))

async function loadWorld() {
  const [u, p, s, a] = await Promise.all([getXml('universe.xml'), getXml('players.xml'), getXml('serverData.xml'), getXml('alliances.xml')])
  const world = buildWorld(u, p, s, a)
  // daily highscores per player: total, economy, research, military (military points include defence).
  // Used by the map to hide weak players and by the hunting lenses; the map still works without them.
  world.stats = new Map()
  const kinds = [['total', 0], ['eco', 1], ['res', 2], ['mil', 3]]
  await Promise.all(kinds.map(async ([field, type]) => {
    try {
      for (const x of (await getXml(`highscore.xml?category=1&type=${type}`)).querySelectorAll('player')) {
        const id = x.getAttribute('id')
        if (!world.stats.has(id)) world.stats.set(id, {})
        world.stats.get(id)[field] = Number(x.getAttribute('score'))
      }
    } catch { /* that list did not load: the lenses that need it say so */ }
  }))
  world.score = new Map([...world.stats].filter(([, v]) => v.total != null).map(([id, v]) => [id, v.total]))
  world.hasMil = [...world.stats.values()].some((v) => v.mil > 0)
  return world
}

// systems that "count" for distance: empty ones and inactive-only ones are skipped, but the TARGET system always counts
function systemCounts(world, g, s) {
  const x = world.sys.get(`${g}:${s}`)
  if (!x) return !world.ignoreEmpty
  return !(world.ignoreInactive && x.active === 0)
}

// a, b = { g, s, p }
function distance(world, a, b) {
  if (a.g !== b.g) {
    const d = Math.abs(a.g - b.g)
    return 20000 * (world.donutGalaxy ? Math.min(d, world.galaxies - d) : d)
  }
  if (a.s !== b.s) {
    const N = world.systems
    const fwd = (b.s - a.s + N) % N // going up, wrapping past the last system
    const steps = world.donutSystem ? Math.min(fwd, N - fwd) : Math.abs(b.s - a.s)
    const dir = world.donutSystem ? (fwd <= N - fwd ? 1 : -1) : Math.sign(b.s - a.s)
    let counted = 0
    for (let i = 1; i <= steps; i++) {
      const s = ((a.s - 1 + dir * i) % N + N) % N + 1
      if (i === steps || systemCounts(world, a.g, s)) counted++
    }
    return 2700 + 95 * counted
  }
  if (a.p !== b.p) return 1000 + 5 * Math.abs(a.p - b.p)
  return 5
}

// mission: 'peaceful' (deployment, transport) or 'war' (attack, espionage); speedPct 10..100
function flightSeconds(world, a, b, ship, tech, lfPct, mission, speedPct = 100) {
  const d = distance(world, a, b)
  const v = shipSpeed(ship, tech, lfPct)
  const secs = Math.round((10 + (3500 / (speedPct / 100)) * Math.sqrt((10 * d) / v)) / world.factor[mission])
  return { seconds: secs, distance: d, shipSpeed: v }
}

function parseCoords(text) {
  const m = String(text).trim().match(/^\[?(\d{1,2})[:.\s,]+(\d{1,3})[:.\s,]+(\d{1,2})\]?$/)
  return m ? { g: +m[1], s: +m[2], p: +m[3] } : null
}
