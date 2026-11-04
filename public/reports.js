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

function parseSpy(doc, a, json) {
  const research = json('research') ?? {}
  const tech = {}
  for (const id of KEEP_TECH) if (research[id] != null) tech[id] = Number(research[id])
  // Hidden techs (not enough probes) come through as missing, which is correct: we only record what the report showed.

  const out = {
    kind: 'spy',
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
  return { kind: 'combat', hash: a('hashcode'), at: Number(a('timestamp')), coords: a('coords'), members: unique }
}
