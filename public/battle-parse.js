// Turns a combat report into one plain "battle" object, the same shape from the report page or from the id lookup:
// {
//   v: 1, hash: 'cr-us-265-...', at: epoch seconds, coords: '1:98:6', moon: bool, winner: 'attacker' | 'defender' | 'draw',
//   fleets: [{ side: 'a' | 'd', key, id: player id, name, tag, from: '1:98:5', pct: { w, s, a },
//              units: { unitId: { n: count at the start, w: weapon, s: shield, h: hull } } }],
//   rounds: [{ a: { strength, hits, absorbed }, d: { ... }, left: { fleetKey: { unitId: count } } }]   (after each round)
//   lost: { a, d } (resources), debris: { m, c, d }, loot: { m, c, d }, moonChance, moonMade, repaired: { unitId: count }
// }
// "absorbed" on a side = damage that side's shields stopped. Strings are shown escaped; numbers are forced to numbers.
// Nothing here talks to the network. Needs units.js.

const bnum = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)
const bstr = (x, max = 40) => String(x ?? '').slice(0, max)
const coordsOf = (c) => (c && typeof c === 'object' ? `${c.galaxy}:${c.system}:${c.position}` : bstr(c, 12))

// one fleet's units: { id: { n, w, s, h } } from a count list and, where known, each unit's real combat values
function unitsOf(counts, details, pct) {
  const out = {}
  for (const [id, n] of Object.entries(counts)) {
    if (!/^\d{1,4}$/.test(id) || !(bnum(n) > 0)) continue
    const d = details?.[id], b = COMBAT_BASE[id]
    out[id] = {
      n: bnum(n),
      w: d ? bnum(d.weapon) : b ? b[2] * (1 + bnum(pct.w) / 100) : 0,
      s: d ? bnum(d.shield) : b ? b[1] * (1 + bnum(pct.s) / 100) : 0,
      h: d ? bnum(d.armor) : b ? b[0] * (1 + bnum(pct.a) / 100) : 0,
    }
  }
  return out
}

// From the report page: data-raw-fleets, -combatrounds, -result, -defenderspaceobject, plus combatData (the per-unit values)
function battleFromHtml(a, json, combatData) {
  const fleetsRaw = json('fleets'), roundsRaw = json('combatrounds'), result = json('result') ?? {}
  if (!Array.isArray(fleetsRaw) || !Array.isArray(roundsRaw)) return null
  const memberOf = (side, key) => combatData?.[side === 'a' ? 'attackerJSON' : 'defenderJSON']?.member?.[key]
  const fleets = fleetsRaw.map((f) => {
    const side = f.side === 'attacker' ? 'a' : 'd', key = bstr(f.fleetId, 20)
    const pctOf = (id) => bnum((f.combatResearchPercentage ?? []).find((x) => x.id === id)?.percentage)
    const pct = { w: pctOf(109), s: pctOf(110), a: pctOf(111) }
    const counts = Object.fromEntries((f.combatTechnologies ?? []).map((t) => [t.technologyId, t.amount]))
    return {
      side, key, id: bnum(f.player?.id), name: bstr(f.player?.name), tag: bstr(f.player?.alliance?.tag, 12),
      from: coordsOf(f.spaceObject?.coordinates), fromMoon: f.spaceObject?.type === 'moon', pct,
      units: unitsOf(counts, memberOf(side, f.fleetId)?.shipDetails, pct),
    }
  })
  const rounds = roundsRaw.slice(0, 6).map((r) => {
    const stat = (side) => { const s = (r.statistics ?? []).find((x) => x.side === side) ?? {}; return { strength: bnum(s.strength), hits: bnum(s.hits), absorbed: bnum(s.absorbedDamage) } }
    const left = {}
    for (const f of r.fleets ?? []) left[bstr(f.fleetId, 20)] = Object.fromEntries((f.technologies ?? []).map((t) => [t.technologyId, bnum(t.remaining)]))
    return { a: stat('attacker'), d: stat('defender'), left }
  })
  const res = (list, field = 'amount') => { const v = (r) => bnum((list ?? []).find((x) => x.resource === r)?.[field]); return { m: v('metal'), c: v('crystal'), d: v('deuterium') } }
  const lostOf = (side) => bnum((result.totalValueOfUnitsLost ?? []).find((x) => x.side === side)?.value)
  const space = json('defenderspaceobject')
  return {
    v: 1, hash: bstr(a('hashcode'), 60), at: bnum(a('timestamp')), coords: bstr(a('coords'), 12), moon: space?.type === 'moon',
    winner: ['attacker', 'defender'].includes(result.winner) ? result.winner : 'draw',
    fleets, rounds, lost: { a: lostOf('attacker'), d: lostOf('defender') },
    debris: res(result.debris?.resources, 'total'), loot: res(result.loot?.resources),
    moonChance: bnum(result.moonCreation?.chance), moonMade: !!(result.moonCreation?.created ?? result.moonCreation?.moonCreated),
    repaired: Object.fromEntries((result.repairedTechnologies ?? []).map((t) => [t.technologyId, bnum(t.amount)])),
  }
}

// From the id lookup (ogapi): generic, attackers[], defenders[], rounds[]
function battleFromJson(id, j) {
  const g = j?.generic
  if (!g || !Array.isArray(j.rounds)) return null
  const fleetsOf = (list, side) => (list ?? []).map((f, i) => {
    const pct = { w: bnum(f.fleet_weapon_percentage), s: bnum(f.fleet_shield_percentage), a: bnum(f.fleet_armor_percentage) }
    const comp = f.fleet_composition ?? []
    const counts = Object.fromEntries(comp.map((u) => [u.ship_type, u.count]))
    const details = Object.fromEntries(comp.map((u) => [u.ship_type, u]))
    return { side, key: side + i, id: bnum(f.fleet_owner_id), name: bstr(f.fleet_owner), tag: bstr(f.fleet_owner_alliance_tag, 12), from: bstr(f.fleet_owner_coordinates, 12), fromMoon: f.fleet_owner_planet_type === 3, pct, units: unitsOf(counts, details, pct) }
  })
  const fleets = [...fleetsOf(j.attackers, 'a'), ...fleetsOf(j.defenders, 'd')]
  const rounds = j.rounds.slice(0, 6).map((r) => {
    const s = r.statistics ?? {}
    const left = {}
    for (const [side, list] of [['a', r.attacker_ships], ['d', r.defender_ships]]) {
      for (const u of list ?? []) {
        const key = side + bnum(u.owner)
        ;(left[key] ??= {})[u.ship_type] = bnum(u.count)
      }
    }
    return { a: { strength: bnum(s.attacker_fullstrength), hits: bnum(s.attacker_hits), absorbed: bnum(s.attacker_absorbed) }, d: { strength: bnum(s.defender_fullstrength), hits: bnum(s.defender_hits), absorbed: bnum(s.defender_absorbed) }, left }
  })
  const repaired = {}
  for (const r of Array.isArray(j.repaired_defenses) ? j.repaired_defenses : []) if (r && typeof r === 'object') repaired[r.defense_type ?? r.ship_type ?? r.type] = bnum(r.count ?? r.amount)
  return {
    v: 1, hash: bstr(id, 60), at: bnum(g.event_timestamp), coords: bstr(g.combat_coordinates, 12), moon: g.combat_planet_type === 3,
    winner: ['attacker', 'defender'].includes(g.winner) ? g.winner : 'draw',
    fleets, rounds, lost: { a: bnum(g.units_lost_attackers), d: bnum(g.units_lost_defenders) },
    debris: { m: bnum(g.debris_metal_total), c: bnum(g.debris_crystal_total), d: bnum(g.debris_deuterium_total) },
    loot: { m: bnum(g.loot_metal), c: bnum(g.loot_crystal), d: bnum(g.loot_deuterium) },
    moonChance: bnum(g.moon_chance), moonMade: !!g.moon_created, repaired,
  }
}
