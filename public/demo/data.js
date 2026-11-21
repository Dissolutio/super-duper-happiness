// The DEMO universe: an invented server ("Crumbspace", s999-us) shaped like a real, crowded one. Every name is made up
// from syllables; only DONUT is real. It is generated from a fixed seed, so every visitor sees the same universe.
// The shape copies a real universe's patterns: ~420 players, about half inactive or on vacation, about 60 alliances
// (a few big ones, a long tail of tiny ones), 1 to 9 planets per player, galaxy 1 the busiest, position 8 the favourite slot.
// Builds DEMO = { xml: { 'universe.xml': ..., ... }, db: { profiles, messages, landings, moons, scans, player_intel }, me }.

const DEMO = (() => {
  let seed = 20261118
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
  const weighted = (pairs) => { let r = rnd() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) if ((r -= w) <= 0) return v; return pairs[0][0] }
  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

  // ---- names, from syllables (never from a real universe) ----
  const A = ['Kra', 'Vel', 'Mor', 'Zan', 'Tor', 'Qui', 'Bri', 'Dra', 'Fen', 'Gul', 'Hex', 'Iro', 'Jax', 'Lum', 'Nyx', 'Oro', 'Pyx', 'Rho', 'Syl', 'Thu', 'Ulm', 'Vor', 'Wyn', 'Xel', 'Yor', 'Zep', 'Cal', 'Ebb', 'Gri', 'Hal']
  const B = ['dor', 'vex', 'lin', 'mar', 'tos', 'rak', 'zel', 'bin', 'gor', 'nus', 'pha', 'rin', 'sko', 'tal', 'unn', 'wix', 'yra', 'zoo', 'ka', 'mo']
  const ENDS = ['', '', '', '', '7', '99', 'X', '_jr', 'ion', 'ar', '.exe', '42', 'Prime', 'ette']
  const used = new Set()
  function playerName() {
    for (;;) {
      const n = rnd() < 0.12 ? `${pick(['Captain', 'Admiral', 'Doctor', 'Baron', 'Lady', 'Sir', 'Agent'])} ${pick(A)}${pick(B)}` : `${pick(A)}${pick(B)}${rnd() < 0.3 ? pick(B) : ''}${pick(ENDS)}`
      if (!used.has(n.toLowerCase())) { used.add(n.toLowerCase()); return n }
    }
  }
  const PLANET_NAMES = ['Homeworld', 'Colony', 'Colony', 'Colony', 'Outpost', 'Forge', 'Haven', 'Crater', 'Dustbowl', 'Bastion', 'Nest', 'Vault', 'Spire', 'Hollow', 'Ember', 'Frost', 'Tide', 'Ash']
  const TAG_A = ['ZRK', 'VOLT', 'OWL', 'KRAK', 'NOVA', 'MOTH', 'RUST', 'HALO', 'BOG', 'FURY', 'MINT', 'ORB', 'LYNX', 'GLOW', 'TUSK', 'ZEN', 'WASP', 'ECHO', 'DUNE', 'JINX']

  // ---- alliances: ours, the enemy, a few mid-size ones and a long tail ----
  const alliances = [{ id: 900001, tag: 'DONUT', name: 'Donut Dungeon Crawlers', size: 30 }, { id: 900002, tag: 'GRIM', name: 'Grim Reapers of the Void', size: 24 }]
  const SIZES = [14, 12, 10, 8, 6, 6, 5, 5, 3, 3, 3, 3, 2, 2, 2, 2, 2, ...Array(40).fill(1)]
  SIZES.forEach((size, i) => {
    const tag = (TAG_A[i % TAG_A.length] + (i >= TAG_A.length ? int(2, 9) : '')).slice(0, 6)
    alliances.push({ id: 900010 + i, tag, name: `${pick(A)}${pick(B)} ${pick(['Union', 'Pact', 'Fleet', 'Order', 'Syndicate', 'Collective', 'Armada', 'Club'])}`, size })
  })

  // ---- players ----
  const STATUS = [['', 196], ['I', 72], ['i', 57], ['vI', 25], ['vi', 21], ['v', 21]]
  const players = []
  let pid = 120000
  const add = (alliance, status) => { const p = { id: String(pid += int(3, 97)), name: playerName(), alliance, status, planets: [] }; players.push(p); return p }
  for (const a of alliances) for (let i = 0; i < a.size; i++) add(a, a.tag === 'DONUT' || a.tag === 'GRIM' ? (rnd() < 0.08 ? 'v' : '') : weighted(STATUS))
  while (players.length < 420) add(null, weighted(STATUS))

  // ---- planets: a home galaxy each, planets clustered near home, the real-looking spread of positions ----
  const GAL_W = [[1, 366], [2, 105], [3, 73], [4, 57], [5, 65], [6, 36], [7, 47]]
  const POS_W = [[1, 9], [2, 5], [3, 4], [4, 31], [5, 18], [6, 40], [7, 63], [8, 391], [9, 67], [10, 35], [11, 17], [12, 41], [13, 7], [14, 5], [15, 16]]
  const COUNT_W = [[1, 98], [2, 54], [3, 49], [4, 32], [5, 24], [6, 13], [7, 5], [8, 1], [9, 3]]
  const taken = new Set()
  let planetId = 33600000
  const war = (p) => p.alliance && (p.alliance.tag === 'DONUT' || p.alliance.tag === 'GRIM')
  for (const p of players) {
    const n = war(p) ? int(4, 9) : weighted(COUNT_W)
    const homeG = p.alliance?.tag === 'DONUT' ? weighted([[1, 3], [2, 2], [4, 2]]) : p.alliance?.tag === 'GRIM' ? weighted([[1, 3], [3, 2], [5, 2]]) : weighted(GAL_W)
    const homeS = int(1, 499)
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 50; tries++) {
        const g = i === 0 || rnd() < 0.6 ? homeG : weighted(GAL_W)
        const s = Math.min(499, Math.max(1, g === homeG ? homeS + int(-60, 60) : int(1, 499)))
        const pos = weighted(POS_W)
        const coords = `${g}:${s}:${pos}`
        if (taken.has(coords)) continue
        taken.add(coords)
        p.planets.push({ id: planetId += int(1, 400), coords, name: i === 0 ? 'Homeworld' : pick(PLANET_NAMES), moon: rnd() < (war(p) ? 0.55 : n > 3 ? 0.25 : 0.06) })
        break
      }
    }
  }

  // ---- points: total, economy, research, military. Some fleeters, some turtles, some miners ----
  for (const p of players) {
    const big = war(p) ? 0.6 + rnd() * 1.2 : p.planets.length / 5
    const idle = /[iI]/.test(p.status)
    p.total = Math.round(Math.exp(11 + rnd() * 3.2 + big * 1.4) * (idle ? 0.5 : 1))
    const style = weighted([['fleeter', 2], ['turtle', 1], ['miner', 3], ['balanced', 4]])
    const mil = { fleeter: 0.55 + rnd() * 0.3, turtle: 0.4 + rnd() * 0.2, miner: 0.03 + rnd() * 0.1, balanced: 0.2 + rnd() * 0.2 }[style]
    const res = style === 'fleeter' ? 0.03 + rnd() * 0.07 : 0.08 + rnd() * 0.17
    p.style = style
    p.mil = Math.round(p.total * mil)
    p.res = Math.round(p.total * res)
    p.eco = Math.max(0, p.total - p.mil - p.res)
  }

  // ---- the game's public files ----
  const H = (root, body) => `<?xml version="1.0" encoding="UTF-8"?>\n<${root} timestamp="${Math.floor(Date.now() / 1000)}" serverId="us999">\n${body}</${root}>\n`
  const xml = {}
  xml['serverData.xml'] = H('serverData', '<name>Crumbspace</name><number>999</number><language>us</language><speed>5</speed><speedFleetPeaceful>8</speedFleetPeaceful><speedFleetWar>1</speedFleetWar><speedFleetHolding>1</speedFleetHolding><galaxies>7</galaxies><systems>499</systems><donutGalaxy>1</donutGalaxy><donutSystem>1</donutSystem><fleetIgnoreEmptySystems>0</fleetIgnoreEmptySystems><fleetIgnoreInactiveSystems>0</fleetIgnoreInactiveSystems>\n')
  // like the real file: each alliance lists its members (the Data tab reads them from here)
  xml['alliances.xml'] = H('alliances', alliances.map((a) => `<alliance id="${a.id}" name="${xmlEsc(a.name)}" tag="${xmlEsc(a.tag)}" founder="${players.find((p) => p.alliance === a)?.id ?? ''}" open="${a.tag === 'DONUT' ? 1 : 0}">${players.filter((p) => p.alliance === a).map((p) => `<player id="${p.id}"/>`).join('')}</alliance>`).join('\n') + '\n')
  xml['players.xml'] = H('players', players.map((p) => `<player id="${p.id}" name="${xmlEsc(p.name)}"${p.status ? ` status="${p.status}"` : ''}${p.alliance ? ` alliance="${p.alliance.id}"` : ''}/>`).join('\n') + '\n')
  xml['universe.xml'] = H('universe', players.flatMap((p) => p.planets.map((pl) => `<planet id="${pl.id}" player="${p.id}" name="${xmlEsc(pl.name)}" coords="${pl.coords}">${pl.moon ? `<moon id="${pl.id + 1}" name="Moon" size="${int(5000, 8900)}"/>` : ''}</planet>`)).join('\n') + '\n')
  const ranked = (field) => [...players].sort((a, b) => b[field] - a[field])
  ;[['total', 0], ['eco', 1], ['res', 2], ['mil', 3]].forEach(([field, type]) => {
    xml[`highscore.xml?category=1&type=${type}`] = H('highscore', ranked(field).map((p, i) => `<player position="${i + 1}" id="${p.id}" score="${p[field]}"${type === 3 ? ` ships="${Math.round(p[field] / 900)}"` : ''}/>`).join('\n') + '\n')
  })

  // alliance totals (the Data tab): the sum of the members' points
  const allianceTotal = alliances.map((a) => ({ id: a.id, score: players.filter((p) => p.alliance === a).reduce((t, p) => t + p.total, 0) })).sort((x, z) => z.score - x.score)
  xml['highscore.xml?category=2&type=0'] = H('highscore', allianceTotal.map((a, i) => `<alliance position="${i + 1}" id="${a.id}" score="${a.score}"/>`).join('\n') + '\n')

  // ---- the war room's own data (what members would have saved) ----
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  const donut = players.filter((p) => p.alliance?.tag === 'DONUT' && p.status === '')
  const grim = players.filter((p) => p.alliance?.tag === 'GRIM' && p.status === '')
  // the demo's members: you plus seven others, named after DONUT players
  const me = '00000000-0000-4000-8000-000000000001'
  const profiles = donut.slice(0, 8).map((p, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, display_name: p.name.replace(/[^\w.-]/g, '').slice(0, 32) || `crawler${i}`, approved: true, is_admin: i === 0, player: p }))
  const prof = (i) => profiles[i % profiles.length]
  const C = (pl) => pl.coords.split(':').map(Number)

  // moons: gates and phalanx levels on war moons
  const moons = []
  for (const p of [...donut, ...grim]) {
    const withMoon = p.planets.filter((x) => x.moon)
    withMoon.forEach((pl, i) => {
      const gate = withMoon.length >= 2 && i < 2 && rnd() < 0.35 // only some players have gates, two at most
      const phalanx = rnd() < 0.2 ? int(1, 8) : null
      if (!gate && phalanx == null) return
      const [galaxy, system, position] = C(pl)
      moons.push({ galaxy, system, position, gate, phalanx, observed_at: iso(now - int(1, 72) * 36e5) })
    })
  }

  // a believable spy-report breakdown worth about `fleet` and `defense` resources: { ships, defense_units, buildings, resources, values }
  const COST = { 204: 4000, 206: 29000, 207: 60000, 215: 85000, 218: 160000, 213: 125000, 219: 31000, 202: 4000, 203: 12000, 209: 18000, 210: 1000 }
  const DCOST = { 401: 2000, 402: 2000, 403: 8000, 404: 37000, 405: 8000, 406: 130000, 407: 20000, 408: 100000, 502: 10000 }
  function fill(total, costs, kinds) {
    const out = {}; let left = total
    kinds.forEach((id, i) => { const part = i === kinds.length - 1 ? left : left * (0.2 + rnd() * 0.5); const n = Math.floor(part / costs[id]); if (n > 0) { out[id] = n; left -= n * costs[id] } })
    return out
  }
  const sum = (o, costs) => Object.entries(o).reduce((t, [id, n]) => t + costs[id] * n, 0)
  function breakdown(fleet, defense, moon) {
    const ships = fill(fleet, COST, rnd() < 0.5 ? [218, 207, 215, 203, 210] : [204, 206, 219, 209, 202])
    const defense_units = moon ? {} : fill(defense, DCOST, [406, 404, 403, 402, 401])
    if (!moon && defense > 0) { defense_units[407] = 1; defense_units[408] = 1 }
    const buildings = moon ? { 41: int(4, 9), 42: int(0, 7), 43: rnd() < 0.5 ? 1 : 0, 14: int(1, 8) } : { 1: int(22, 32), 2: int(18, 27), 3: int(16, 26), 4: int(18, 28), 12: int(8, 16), 14: 10, 15: int(0, 5), 21: int(8, 14), 22: int(8, 13), 23: int(8, 12), 24: int(7, 11), 31: int(8, 13), 44: int(0, 6) }
    return { ships, defense_units, buildings, resources: int(50000, 9000000), fleet_value: sum(ships, COST), defense_value: sum(defense_units, DCOST) }
  }

  // scans: a few targets we probed lately
  const scans = []
  const targets = players.filter((p) => !war(p) && p.status === '' && p.mil > 200000).slice(0, 14)
  for (const p of targets) {
    const [galaxy, system, position] = C(p.planets[0])
    const ships = p.style === 'turtle' ? p.mil * 0.15 : p.mil * 0.7
    scans.push({ galaxy, system, position, moon: false, player_id: Number(p.id), fleet_value: Math.round(ships * 1000), defense_value: Math.round((p.mil - ships) * 1000), observed_at: iso(now - int(1, 120) * 36e5), ...breakdown(ships * 1000, (p.mil - ships) * 1000, false) })
  }
  // and a few planets and moons of the enemy and of ourselves, with the full breakdown
  for (const p of [...grim.slice(0, 6), ...donut.slice(0, 3)]) {
    for (const pl of p.planets.slice(0, 3)) {
      const [galaxy, system, position] = C(pl)
      const f = p.mil * 1000 * (0.1 + rnd() * 0.5), d = p.mil * 1000 * (0.05 + rnd() * 0.2)
      scans.push({ galaxy, system, position, moon: false, player_id: Number(p.id), observed_at: iso(now - int(1, 100) * 36e5), ...breakdown(f, d, false) })
      if (pl.moon && rnd() < 0.7) {
        const b = breakdown(p.mil * 1000 * rnd() * 0.6, 0, true)
        const known = moons.find((m) => m.galaxy === galaxy && m.system === system && m.position === position)
        b.buildings[42] = known?.phalanx ?? 0
        b.buildings[43] = known?.gate ? 1 : 0
        scans.push({ galaxy, system, position, moon: true, player_id: Number(p.id), observed_at: iso(now - int(1, 100) * 36e5), ...b })
      }
    }
  }

  // player intel from (pretend) spy reports
  const player_intel = [...grim.slice(0, 8), ...targets.slice(0, 4)].map((p) => ({
    player_id: Number(p.id), name: p.name, character_class: pick(['Collector', 'General', 'Discoverer']),
    tech: { 106: int(8, 16), 108: int(10, 18), 109: int(12, 20), 110: int(12, 20), 111: int(12, 21), 115: int(14, 21), 117: int(10, 17), 118: int(8, 15) },
    speed_bonus: { 204: int(0, 12), 207: int(0, 18), 215: int(0, 15), 203: int(0, 10) },
    tech_at: iso(now - int(2, 200) * 36e5), tech_via: 'html', combat_pct: {}, combat_at: null, combat_via: null, updated_at: iso(now),
  }))

  // flights: an enemy strike on one of us, our counter-hit, and the usual traffic
  const ours = donut[0].planets, ours2 = donut[2].planets, theirs = grim[0].planets, theirs2 = grim[3].planets
  let lid = 0
  const flight = (o) => { const [g, s, p] = C(o.to); const from = o.from ? C(o.from) : [null, null, null]; return { id: ++lid, side: o.side, mission: o.mission, category: o.category, galaxy: g, system: s, position: o.pos16 ? 16 : p, strength: o.strength, arrives_at: iso(now + o.in * 60000), origin_galaxy: from[0], origin_system: from[1], origin_position: from[2], returns_at: o.back ? iso(now + o.back * 60000) : null, source: o.source, author: prof(o.by).id, profiles: { display_name: prof(o.by).display_name } } }
  const landings = [
    flight({ side: 'theirs', mission: 'attack', category: 'alert', to: ours[1], from: theirs[0], strength: '180M battleships + reapers', in: 47, source: 'event', by: 1 }),
    flight({ side: 'theirs', mission: 'espionage', category: 'alert', to: ours2[0], from: theirs2[1], strength: 'probes', in: 3, source: 'event', by: 2 }),
    flight({ side: 'ours', mission: 'attack', category: 'opportunity', to: theirs2[0], from: ours[0], strength: '120M crash fleet', in: 95, back: 190, source: 'ally', by: 0 }),
    flight({ side: 'theirs', mission: 'deploy', category: 'opportunity', to: theirs[2], from: theirs[0], strength: '60M fleetsave', in: 128, source: 'phalanx', by: 3 }),
    flight({ side: 'move', mission: 'deploy', category: 'info', to: ours[2], from: ours[0], strength: 'main fleet', in: 210, source: 'ally', by: 0 }),
    flight({ side: 'ours', mission: 'expedition', category: 'info', to: ours[0], from: ours[0], pos16: true, strength: 'pathfinders', in: 22, back: 140, source: 'ally', by: 4 }),
    flight({ side: 'theirs', mission: 'return', category: 'opportunity', to: theirs2[1], from: ours2[1], strength: '35M returning', in: 64, source: 'phalanx', by: 5 }),
  ]

  // chat
  const coord = (pl) => `[${pl.coords}]`
  const said = [
    ['general', 1, 'hey crawlers, who is online tonight?'],
    ['general', 2, `@${prof(0).display_name} you around? need a gate jump later`],
    ['general', 0, 'yep, ping me. moving my main fleet in a bit'],
    ['general', 3, 'reminder: fleetsave before you sleep, GRIM has been active at night'],
    ['targets', 2, `${grim[0].name} probed me twice from ${coord(theirs2[1])}, something is coming`],
    ['targets', 1, `big fleet incoming on ${coord(ours[1])} in ~47m, logged it above. need defenders`],
    ['targets', 4, `${targets[0]?.name ?? 'someone'} has a fat fleet sitting at ${coord(targets[0]?.planets[0] ?? ours[0])}, scanned it this morning`],
    ['targets', 0, `I can hit ${coord(theirs2[0])} while they are busy. ACS anyone? @${prof(3).display_name}`],
  ]
  const messages = said.map(([channel, by, body], i) => ({ id: i + 1, channel, body, created_at: iso(now - (said.length - i) * 7 * 60000), author: prof(by).id, profiles: { display_name: prof(by).display_name } }))

  // ---- battles: simulated fights, made on first use (they need units.js, which loads after this file) ----
  // A small version of the game's combat: every unit fires once per round at a random enemy; a shot under 1% of the
  // target's shield bounces; shields soak first and recharge every round; a hit that leaves a unit below 70% hull may
  // blow it up; some units get extra shots (rapid fire).
  // rapid fire (shooter -> target: n means a 1 - 1/n chance of another shot), the main pairs
  const RF_SMALL = { 210: 5, 212: 5, 217: 5 }
  const RAPID_FIRE = {
    202: RF_SMALL, 203: RF_SMALL, 204: RF_SMALL, 205: { ...RF_SMALL, 202: 3 }, 206: { ...RF_SMALL, 204: 6, 401: 10 }, 207: { ...RF_SMALL, 219: 5 },
    211: { ...RF_SMALL, 401: 20, 402: 20, 403: 10, 405: 10, 404: 5, 406: 5 }, 213: { ...RF_SMALL, 402: 10, 215: 2 },
    214: { 202: 250, 203: 250, 204: 200, 205: 100, 206: 33, 207: 30, 208: 250, 209: 250, 210: 1250, 211: 25, 212: 1250, 213: 5, 215: 15, 217: 1250, 218: 10, 219: 30, 401: 200, 402: 200, 403: 100, 404: 50, 405: 100 },
    215: { ...RF_SMALL, 202: 3, 203: 3, 205: 4, 206: 4, 207: 7 }, 218: { ...RF_SMALL, 207: 7, 211: 4, 213: 3 }, 219: { ...RF_SMALL, 206: 3, 204: 3, 205: 2 },
  }
  function simulate(fleets, seedNo) {
    let sd = seedNo
    const r = () => { sd = (sd * 1103515245 + 12345) % 2147483648; return sd / 2147483648 }
    const units = { a: [], d: [] }
    for (const f of fleets) for (const [id, u] of Object.entries(f.units)) for (let i = 0; i < u.n; i++) units[f.side].push({ key: f.key, id, w: u.w, sMax: u.s, s: u.s, hMax: u.h, h: u.h })
    const rounds = []
    for (let round = 0; round < 6 && units.a.length && units.d.length; round++) {
      const stat = { a: { strength: 0, hits: 0, absorbed: 0 }, d: { strength: 0, hits: 0, absorbed: 0 } }
      for (const side of ['a', 'd']) for (const x of units[side]) x.s = x.sMax
      for (const [side, other] of [['a', 'd'], ['d', 'a']]) {
        const targets = units[other]
        for (const x of units[side]) {
          for (let shots = 0; shots < 2000; shots++) {
            const t = targets[Math.floor(r() * targets.length)]
            stat[side].hits++; stat[side].strength += x.w
            if (x.w < t.sMax * 0.01) stat[other].absorbed += x.w
            else {
              const soak = Math.min(t.s, x.w); t.s -= soak; stat[other].absorbed += soak
              if (x.w > soak && t.h > 0) { t.h -= x.w - soak; if (t.h < t.hMax * 0.7 && r() < 1 - t.h / t.hMax) t.h = 0 } // below 70% hull: may blow up
            }
            const rf = RAPID_FIRE[x.id]?.[t.id] // rapid fire: a chance to shoot again
            if (!rf || r() >= 1 - 1 / rf) break
          }
        }
      }
      for (const side of ['a', 'd']) units[side] = units[side].filter((x) => x.h > 0) // the dead are still shot at until the round ends
      const left = {}
      for (const f of fleets) left[f.key] = Object.fromEntries(Object.keys(f.units).map((id) => [id, 0]))
      for (const side of ['a', 'd']) for (const x of units[side]) left[x.key][x.id]++
      for (const side of ['a', 'd']) for (const k of ['strength', 'absorbed']) stat[side][k] = Math.round(stat[side][k])
      rounds.push({ ...stat, left })
    }
    return rounds
  }
  function makeBattles() {
    const hex = () => Array.from({ length: 40 }, () => '0123456789abcdef'[int(0, 15)]).join('')
    const fleet = (side, key, p, from, list, tech = [15, 15, 16]) => {
      const pct = { w: tech[0] * 10, s: tech[1] * 10, a: tech[2] * 10 }
      const units = {}
      for (const [id, n] of Object.entries(list)) { const b = COMBAT_BASE[id]; units[id] = { n, w: Math.round(b[2] * (1 + pct.w / 100)), s: Math.round(b[1] * (1 + pct.s / 100)), h: Math.round(b[0] * (1 + pct.a / 100)) } }
      return { side, key, id: Number(p.id), name: p.name, tag: p.alliance?.tag ?? '', from: from ?? p.planets[0].coords, fromMoon: !!from, pct, units }
    }
    const battle = (hoursAgo, at, fleets, seedNo) => {
      const rounds = simulate(fleets, seedNo)
      const end = rounds[rounds.length - 1].left
      const alive = (side) => fleets.filter((f) => f.side === side).some((f) => Object.values(end[f.key]).some((n) => n > 0))
      const winner = alive('a') && alive('d') ? 'draw' : alive('a') ? 'attacker' : 'defender'
      const lostOf = (side) => fleets.filter((f) => f.side === side).reduce((t, f) => t + Object.entries(f.units).reduce((s, [id, u]) => s + (u.n - end[f.key][id]) * unitCost(id), 0), 0)
      const shipLoss = fleets.reduce((t, f) => t + Object.entries(f.units).filter(([id]) => Number(id) < 400).reduce((s, [id, u]) => s + (u.n - end[f.key][id]) * unitCost(id), 0), 0)
      const repaired = {}
      for (const f of fleets.filter((x) => x.side === 'd')) for (const [id, u] of Object.entries(f.units)) if (Number(id) >= 400 && u.n > end[f.key][id]) repaired[id] = Math.round((u.n - end[f.key][id]) * 0.7)
      const [g, s, p] = at.coords.split(':').map(Number)
      const data = {
        v: 1, hash: `cr-us-999-${hex()}`, at: Math.floor((now - hoursAgo * 36e5) / 1000), coords: at.coords, moon: !!at.moonFight, winner, fleets, rounds,
        lost: { a: lostOf('a'), d: lostOf('d') }, debris: { m: Math.round(shipLoss * 0.3 * 0.6), c: Math.round(shipLoss * 0.3 * 0.35), d: 0 },
        loot: winner === 'attacker' ? { m: int(200000, 3000000), c: int(100000, 1500000), d: int(50000, 800000) } : { m: 0, c: 0, d: 0 },
        moonChance: Math.min(20, Math.floor(shipLoss * 0.3 / 100000)), moonMade: false, repaired,
      }
      const tags = (side) => [...new Set(fleets.filter((f) => f.side === side).map((f) => f.tag).filter(Boolean))]
      return { hash: data.hash, fought_at: new Date(data.at * 1000).toISOString(), galaxy: g, system: s, position: p, winner, attacker_tags: tags('a'), defender_tags: tags('d'), lost_attacker: data.lost.a, lost_defender: data.lost.d, data, added_by: profiles[int(0, profiles.length - 1)].id }
    }
    const d0 = donut[0], d1 = donut[1], d2 = donut[2], g0 = grim[0], g1 = grim[1], g3 = grim[3]
    const other = players.find((p) => p.alliance && !war(p) && p.status === '')
    return [
      // our crash fleet into a defended GRIM planet: the light fighters soak the turrets' fire
      battle(5, g1.planets[1], [fleet('a', 'a0', d0, d0.planets[0].coords, { 218: 900, 207: 2800, 215: 900, 219: 500, 204: 6000 }, [16, 15, 17]), fleet('d', 'd0', g1, null, { 204: 1500, 206: 300, 202: 500, 401: 4000, 402: 2000, 403: 300, 404: 60, 406: 15, 407: 1, 408: 1 }, [14, 14, 15])], 11),
      // GRIM deathstars with fodder hit our fleet parked on a moon: the fodder dies, the deathstars do not
      battle(30, { coords: d1.planets[0].coords, moonFight: true }, [fleet('a', 'a0', g0, g0.planets[0].coords, { 214: 14, 204: 5000, 215: 500 }, [17, 16, 17]), fleet('d', 'd0', d1, null, { 207: 250, 206: 900, 203: 400, 204: 1500 }, [15, 15, 15])], 22),
      // a suicide run: light fighters against shields they cannot get through
      battle(52, d2.planets[0], [fleet('a', 'a0', g3, g3.planets[0].coords, { 204: 600 }, [12, 12, 12]), fleet('d', 'd0', d2, null, { 401: 1500, 402: 800, 404: 15, 407: 1, 408: 1, 212: 300 }, [15, 16, 15])], 33),
      // two of ours together (ACS) against a GRIM fleet: six rounds, nobody wins
      battle(80, g3.planets[0], [fleet('a', 'a0', d0, d0.planets[1].coords, { 207: 120, 215: 80 }, [15, 15, 15]), fleet('a', 'a1', d2, d2.planets[0].coords, { 206: 400, 204: 500 }, [14, 14, 14]), fleet('d', 'd0', g3, null, { 207: 150, 206: 300, 205: 600, 408: 1, 407: 1, 405: 300 }, [15, 16, 16])], 44),
      // not part of the war: GRIM picks on someone else
      ...(other ? [battle(120, other.planets[0], [fleet('a', 'a0', g0, g0.planets[1].coords, { 207: 300, 206: 500, 204: 1000 }), fleet('d', 'd0', other, null, { 204: 300, 401: 900, 402: 300 }, [11, 11, 11])], 55)] : []),
    ]
  }

  return { xml, me, makeBattles, db: { profiles: profiles.map(({ player, ...p }) => p), messages, landings, moons, scans, player_intel, intel_reports: [], battles: null } }
})()
