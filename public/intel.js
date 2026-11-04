// What we know about players, from pasted reports, and the paste box itself.
// A newer report always replaces older data (decided in the database, see supabase/intel.sql).
// Needs auth.js (sb, getToken), app.js (el, esc), reports.js (parseReport, reportIds, fetchReport), flight.js (SHIPS) and gate.js (logout).
// The player cards and player page are drawn by player.js.

const TECH_NAMES = { 106: 'Espionage', 108: 'Computer', 109: 'Weapons', 110: 'Shields', 111: 'Armour', 115: 'Combustion', 117: 'Impulse', 118: 'Hyperspace' }
// reports looked up by id come from a third-party service, so say so
const VIA = { id: ' (looked up by id)' }

let intelRows = [] // everything the database knows, newest load; also used by the flight calculator and player.js

function ago(iso) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000))
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

async function loadIntel() {
  try {
    intelRows = await sb('/rest/v1/player_intel?select=*&order=name.asc', { token: await getToken() })
    if (typeof fillTechChoices === 'function') fillTechChoices()
    renderRoster()
  } catch (e) {
    if (e.status === 401) return logout()
    el('intel-msg').textContent = e.message
  }
}

// ---- telling the person what a report changed ----

// what this report would change on the profile we already hold (row may be undefined = new player)
function techChanges(rep, row) {
  const out = []
  for (const [id, v] of Object.entries(rep.tech)) {
    const old = row?.tech?.[id]
    if (old !== v) out.push(old == null ? `${TECH_NAMES[id]} ${v}` : `${TECH_NAMES[id]} ${old} → ${v}`)
  }
  const known = (id) => SHIPS.some((s) => s.id === Number(id))
  const speedDiffers = Object.entries(rep.speed_bonus).some(([id, v]) => known(id) && !(Math.abs((row?.speed_bonus?.[id] ?? NaN) - v) < 0.01))
  if (speedDiffers) out.push('lifeform speed')
  return out
}

function combatChanges(m, row) {
  const old = row?.combat_pct ?? {}
  return [['weapon', 'weapons'], ['shield', 'shields'], ['armor', 'armour']]
    .filter(([k]) => m.pct[k] != null && old[k] !== m.pct[k])
    .map(([k, label]) => (old[k] == null ? `${label} ${m.pct[k]}%` : `${label} ${old[k]}% → ${m.pct[k]}%`))
}

// save one parsed report. Returns { lines, updated } where updated = how many players got new intel
async function saveReport(rep) {
  const status = await sb('/rest/v1/rpc/add_intel', { method: 'POST', body: { p: rep }, token: await getToken() })
  if (status === 'duplicate') return { lines: ['No new intel: this report was already added.'], updated: 0 }
  const who = rep.kind === 'spy' ? [{ name: rep.name, id: rep.player_id, changes: techChanges(rep, rowFor(rep.player_id)) }]
    : rep.members.map((m) => ({ name: m.name, id: m.player_id, changes: combatChanges(m, rowFor(m.player_id)) }))
  const lines = []
  let updated = 0
  for (const w of who) {
    if (status === 'older') lines.push(`No new intel on ${w.name}: we already have newer data.`)
    else if (!rowFor(w.id)) { lines.push(`New player: ${w.name}.`); updated++ }
    else if (!w.changes.length) lines.push(`No new intel on ${w.name}: same numbers as before.`)
    else { lines.push(`Updated ${w.name}: ${w.changes.join(', ')}.`); updated++ }
  }
  await loadIntel() // so the next report in a batch compares against the new state
  return { lines, updated }
}
const rowFor = (id) => intelRows.find((r) => String(r.player_id) === String(id))

el('intel-go').onclick = async () => {
  const text = el('intel-paste').value.trim()
  if (!text) return (el('intel-msg').textContent = 'Paste a report first.')
  el('intel-go').disabled = true
  const lines = []
  let updated = 0, read = 0 // read = reports that were understood and checked
  const show = () => {
    const uniq = [...new Set(lines)]
    let head = updated ? `${updated} player${updated > 1 ? 's' : ''} updated` : read ? 'No new intel' : ''
    if (uniq.length === 1 && uniq[0].startsWith(head) && !updated) head = '' // the line already says it
    el('intel-msg').textContent = [head, ...uniq].filter(Boolean).join('\n')
  }
  const take = (r) => { lines.push(...r.lines); updated += r.updated; read++ }
  try {
    const ids = reportIds(text)
    if (ids) { // one or more report ids: look each one up
      for (const id of ids) {
        const rep = await fetchReport(id)
        if (rep.error) lines.push(rep.error)
        else take(await saveReport(rep))
        show()
      }
    } else { // a whole report page
      const rep = parseReport(text)
      if (rep.error) lines.push(rep.error)
      else take(await saveReport(rep))
    }
    el('intel-paste').value = ''
  } catch (e) {
    if (e.status === 401) return logout()
    lines.push(e.message)
  } finally {
    show()
    el('intel-go').disabled = false
  }
}
