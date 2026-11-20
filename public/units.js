// OGame unit ids, names and build costs (metal + crystal + deuterium), for reading spy reports.
// Costs let us work out a fleet's or a defence's value when a report gives only counts; checked against the
// game's own "fleetvalue" / "defensevalue" on real reports (they match exactly).

const SHIP_UNITS = {
  204: ['Light Fighter', 4000, 'war'], 205: ['Heavy Fighter', 10000, 'war'], 206: ['Cruiser', 29000, 'war'],
  207: ['Battleship', 60000, 'war'], 215: ['Battlecruiser', 85000, 'war'], 211: ['Bomber', 90000, 'war'],
  213: ['Destroyer', 125000, 'war'], 214: ['Deathstar', 10000000, 'war'], 218: ['Reaper', 160000, 'war'],
  219: ['Pathfinder', 31000, 'war'],
  202: ['Small Cargo', 4000, 'civil'], 203: ['Large Cargo', 12000, 'civil'], 208: ['Colony Ship', 40000, 'civil'],
  209: ['Recycler', 18000, 'civil'], 210: ['Espionage Probe', 1000, 'civil'], 212: ['Solar Satellite', 2500, 'civil'],
  217: ['Crawler', 5000, 'civil'],
}
const DEFENSE_UNITS = {
  401: ['Rocket Launcher', 2000], 402: ['Light Laser', 2000], 403: ['Heavy Laser', 8000], 404: ['Gauss Cannon', 37000],
  405: ['Ion Cannon', 8000], 406: ['Plasma Turret', 130000], 407: ['Small Shield Dome', 20000], 408: ['Large Shield Dome', 100000],
  502: ['Anti-Ballistic Missile', 10000], 503: ['Interplanetary Missile', 25000],
}
const BUILDING_NAMES = {
  1: 'Metal Mine', 2: 'Crystal Mine', 3: 'Deuterium Synthesizer', 4: 'Solar Plant', 12: 'Fusion Reactor',
  14: 'Robotics Factory', 15: 'Nanite Factory', 21: 'Shipyard', 22: 'Metal Storage', 23: 'Crystal Storage',
  24: 'Deuterium Tank', 31: 'Research Lab', 33: 'Terraformer', 34: 'Alliance Depot', 36: 'Space Dock',
  41: 'Lunar Base', 42: 'Sensor Phalanx', 43: 'Jump Gate', 44: 'Missile Silo',
}

// { id: count } from a report's JSON: an object as-is, an empty [] as {}, or a list like [{ship_type, count}]
// (the id-lookup format). Anything else (hidden, broken) -> null.
function unitCounts(raw) {
  if (Array.isArray(raw)) {
    const out = {}
    for (const x of raw) {
      if (!x || typeof x !== 'object') continue
      const idKey = Object.keys(x).find((k) => /_type$|^id$/.test(k))
      const n = x.count ?? x.amount ?? x.level ?? x.value
      if (idKey && /^\d{1,4}$/.test(String(x[idKey])) && Number.isFinite(Number(n))) out[x[idKey]] = Number(n)
    }
    return out
  }
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const [k, v] of Object.entries(raw)) if (/^\d{1,4}$/.test(k) && Number.isFinite(Number(v)) && Number(v) >= 0) out[k] = Number(v)
  return out
}

// total build cost of { id: count } using one of the tables above; filter picks which ships count (e.g. warships only)
function unitValue(counts, table, filter = () => true) {
  let v = 0
  for (const [id, n] of Object.entries(counts ?? {})) if (table[id] && filter(table[id])) v += table[id][1] * n
  return v
}

// "1.2K Light Fighter, 30 Large Cargo" biggest value first, at most `max` kinds
function unitList(counts, table, max = 99) {
  const rows = Object.entries(counts ?? {}).filter(([id, n]) => n > 0 && table[id]).sort((a, b) => table[b[0]][1] * b[1] - table[a[0]][1] * a[1])
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n.toLocaleString('en-US'))
  return rows.slice(0, max).map(([id, n]) => `${fmt(n)} ${table[id][0]}`)
}
