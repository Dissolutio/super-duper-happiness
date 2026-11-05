// Reads a pasted OGame report (the HTML of the opened message) into a small plain object.
// Spy report  -> { kind:'spy', hash, at, player_id, name, class, coords, tech:{id:level}, speed_bonus:{shipId:percent} }
// Combat rpt  -> { kind:'combat', hash, at, coords, members:[{player_id, name, pct:{weapon,shield,armor}}] }
// Nothing here talks to the game or the network. DOMParser never runs scripts or loads images.
// The result is checked again by add_intel() in the database, so treat this as convenience, not security.

// OGame tech ids we keep: 106 espionage, 108 computer, 109 weapons, 110 shields, 111 armour, 115 combustion, 117 impulse, 118 hyperspace
const KEEP_TECH = [106, 108, 109, 110, 111, 115, 117, 118]

function parseReport(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const raw = doc.querySelector('.rawMessageData')
  if (!raw) return { error: 'This does not look like an OGame report. Open the report in the game, copy the whole message, and paste it here.' }
  const a = (name) => raw.getAttribute('data-raw-' + name)
  const json = (name) => { try { return JSON.parse(a(name)) } catch { return null } }

  if (a('hashcode')?.startsWith('sr-')) return parseSpy(doc, a, json)
  if (a('hashcode')?.startsWith('cr-')) return parseCombat(doc, a, json)
  return { error: 'Only spy reports and combat reports are understood so far.' }
}

// A spy report on a MOON that shows its buildings tells us its phalanx level and whether it has a jump gate
// (building ids 42 = sensor phalanx, 43 = jump gate; planet type 3 = moon). Null for a planet, or when the buildings were hidden.
function moonFrom(coords, type, levels) {
  const m = String(coords).match(/^([1-7]):(\d{1,3}):(\d{1,2})$/)
  if (type !== 3 || !m || !levels || !Object.keys(levels).length) return null
  return { galaxy: Number(m[1]), system: Number(m[2]), position: Number(m[3]), gate: Number(levels[43] ?? 0) > 0, phalanx: Number(levels[42] ?? 0) }
}

function parseSpy(doc, a, json) {
  const research = json('research') ?? {}
  const tech = {}
  for (const id of KEEP_TECH) if (research[id] != null) tech[id] = Number(research[id])
  // Hidden techs (not enough probes) come through as missing, which is correct: we only record what the report showed.

  const out = {
    kind: 'spy',
    via: 'html',
    hash: a('hashcode'),
    at: Number(a('timestamp')),
    player_id: Number(a('targetplayerid')),
    name: a('playername'),
    class: json('characterclass')?.name ?? null,
    coords: a('coordinates'),
    tech,
    speed_bonus: shipSpeedBonus(doc),
    fleet_value: Number(a('fleetvalue')) || 0,
    defense_value: Number(a('defensevalue')) || 0,
    moon: moonFrom(a('coordinates'), Number(a('targetplanettype')), json('buildings')),
  }
  if (!out.player_id || !out.name || !out.at) return { error: 'The report is missing the player or the time.' }
  return out
}

// The lifeform "Ship bonuses" table: one row per ship, 4th column is Speed. A dash means no bonus.
function shipSpeedBonus(doc) {
  const out = {}
  const section = doc.querySelector('[data-toggable-target="ships"]')
  if (!section) return out
  for (const head of section.querySelectorAll('inner-bonus-item-heading[data-toggable]')) {
    const id = head.getAttribute('data-toggable')
    if (!/^2\d\d$/.test(id) || !head.querySelector(':scope > .subCategoryTitle')) continue // ship rows only, not the per-planet rows
    const cell = head.querySelectorAll(':scope > bonus-items > bonus-item')[3]
    const n = parseFloat(cell?.textContent ?? '')
    out[id] = Number.isFinite(n) ? n : 0
  }
  return out
}

function parseCombat(doc, a, json) {
  // the fight itself sits in a script: var combatData = jQuery.parseJSON('{...}')
  let data = null
  for (const s of doc.querySelectorAll('script')) {
    const m = s.textContent.match(/var combatData = jQuery\.parseJSON\('(.*?)'\);/s)
    if (m) { try { data = JSON.parse(m[1]) } catch { /* handled below */ } }
  }
  if (!data) return { error: 'Could not read the fight from this combat report.' }

  const members = []
  for (const side of ['attackerJSON', 'defenderJSON']) {
    for (const m of Object.values(data[side]?.member ?? {})) {
      if (!m.ownerID || !m.ownerName) continue
      members.push({ player_id: m.ownerID, name: m.ownerName, pct: { weapon: m.weaponPercentage, shield: m.shieldPercentage, armor: m.armorPercentage } })
    }
  }
  // same player can appear in several fleets: keep one entry each
  const unique = [...new Map(members.map((m) => [m.player_id, m])).values()]
  return { kind: 'combat', via: 'html', hash: a('hashcode'), at: Number(a('timestamp')), coords: a('coords'), members: unique }
}

// ---- Report ID lookup (the short "sr-us-265-..." / "cr-us-265-..." id from a report's API-key button) ----
// Goes through our own server to a third-party service (see README), so the answer is less trusted than a pasted page.

const REPORT_ID = /^(sr|cr)-us-265-[0-9a-f]{40}$/
const CLASS_NAMES = { 1: 'Collector', 2: 'General', 3: 'Discoverer' }

// "one or more report ids, nothing else" -> the list of ids, otherwise null
function reportIds(text) {
  const parts = text.trim().split(/[\s,;]+/)
  return parts.length <= 20 && parts.every((p) => REPORT_ID.test(p)) ? [...new Set(parts)] : null
}

async function fetchReport(id) {
  let json
  try {
    const r = await fetch(`/ogapi/v1/report/${id}/true`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return { error: `Could not look up ${id.slice(0, 13)}... (the service said ${r.status}). The id may be wrong or too old, or the service is down. Pasting the report page works too.` }
    const body = await r.text()
    if (body.length > 2000000) return { error: 'That answer was far bigger than a report, so it was ignored.' }
    json = JSON.parse(body)
  } catch {
    return { error: 'The report lookup service did not answer. Try again later, or paste the report page instead.' }
  }
  const mapped = id.startsWith('sr-') ? spyFromJson(id, json) : combatFromJson(id, json)
  return mapped ?? { error: 'The lookup service answered, but not with the report we asked for.' }
}

const asId = (n) => (Number.isInteger(n) && n > 0 ? n : null)

function spyFromJson(id, j) {
  const g = j?.generic
  if (!g || g.sr_id !== id.slice(10) || !asId(g.defender_user_id) || !g.defender_name) return null // the target of a spy report is the "defender"
  const tech = {}
  for (const r of j.details?.research ?? []) if (KEEP_TECH.includes(r.research_type)) tech[r.research_type] = Number(r.level)
  const speed_bonus = {}
  for (const [ship, b] of Object.entries(j.details?.lifeformBonuses?.BaseStatsBooster ?? {})) {
    if (/^2\d\d$/.test(ship) && typeof b.speed === 'number') speed_bonus[ship] = Math.round(b.speed * 100000) / 1000 // 0.05166 -> 5.166 (%)
  }
  const levels = g.failed_buildings ? null : Object.fromEntries((j.details?.buildings ?? []).map((b) => [b.building_type, b.level]))
  return {
    kind: 'spy', via: 'id', hash: id, at: g.event_timestamp,
    player_id: g.defender_user_id, name: g.defender_name, class: CLASS_NAMES[g.defender_character_class_id] ?? null,
    coords: g.defender_planet_coordinates, tech, speed_bonus,
    moon: moonFrom(g.defender_planet_coordinates, g.defender_planet_type, levels),
  }
}

function combatFromJson(id, j) {
  const g = j?.generic
  if (!g || g.cr_id !== id.slice(10)) return null
  const members = [...(j.attackers ?? []), ...(j.defenders ?? [])]
    .filter((m) => asId(m.fleet_owner_id) && m.fleet_owner)
    .map((m) => ({ player_id: m.fleet_owner_id, name: m.fleet_owner, pct: { weapon: m.fleet_weapon_percentage, shield: m.fleet_shield_percentage, armor: m.fleet_armor_percentage } }))
  const unique = [...new Map(members.map((m) => [m.player_id, m])).values()]
  return unique.length ? { kind: 'combat', via: 'id', hash: id, at: g.event_timestamp, coords: g.combat_coordinates, members: unique } : null
}
