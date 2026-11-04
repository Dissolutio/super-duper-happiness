// Players screen: what we know about each player from pasted reports.
// A newer report always replaces older data (decided in the database, see supabase/intel.sql).
// Needs auth.js (sb, getToken), app.js (el, esc), reports.js (parseReport, reportIds, fetchReport) and gate.js (logout).

const SHIPS = { 202: 'Small cargo', 209: 'Recycler', 204: 'Light fighter', 207: 'Battleship', 219: 'Pathfinder' }

function ago(iso) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000))
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

async function loadIntel() {
  try {
    const rows = await sb('/rest/v1/player_intel?select=*&order=name.asc', { token: await getToken() })
    renderIntel(rows)
  } catch (e) {
    if (e.status === 401) return logout()
    el('intel-msg').textContent = e.message
  }
}

function renderIntel(rows) {
  if (!rows.length) return (el('intel-list').innerHTML = '<p class="empty">No players yet. Paste a spy report above.</p>')
  el('intel-list').innerHTML = rows.map((r) => {
    const t = r.tech ?? {}
    const lv = (id) => (t[id] ?? '?')
    const c = r.combat_pct ?? {}
    const bonus = Object.entries(SHIPS).filter(([id]) => r.speed_bonus?.[id] != null)
      .map(([id, name]) => `${name} ${r.speed_bonus[id]}%`).join(' &middot; ')
    return `
      <div class="card">
        <div class="top"><span class="name">${esc(r.name)}</span><span class="rank">${esc(r.character_class ?? '')}</span></div>
        <dl>
          <div><dt>Combustion</dt><dd>${lv(115)}</dd></div>
          <div><dt>Impulse</dt><dd>${lv(117)}</dd></div>
          <div><dt>Hyperspace</dt><dd>${lv(118)}</dd></div>
          <div><dt>Weapons</dt><dd>${lv(109)}</dd></div>
          <div><dt>Shields</dt><dd>${lv(110)}</dd></div>
          <div><dt>Armour</dt><dd>${lv(111)}</dd></div>
        </dl>
        ${r.tech_at ? `<div class="hint">Tech from a spy report ${ago(r.tech_at)}${VIA[r.tech_via] ?? ''}</div>` : '<div class="hint">No spy report yet</div>'}
        ${bonus ? `<div class="hint">Lifeform speed: ${bonus}</div>` : ''}
        ${r.combat_at ? `<div class="hint">Last fight ${ago(r.combat_at)}${VIA[r.combat_via] ?? ''}: weapons ${esc(c.weapon ?? '?')}%, shields ${esc(c.shield ?? '?')}%, armour ${esc(c.armor ?? '?')}%</div>` : ''}
      </div>`
  }).join('')
}

// reports looked up by id come from a third-party service, so say so
const VIA = { id: ' (looked up by id)' }

const RESULT = {
  added: 'Saved.',
  older: 'Saved, but we already had newer data for that player, so the profile was not changed.',
  duplicate: 'That report was already added.',
}

// save one parsed report, returns a sentence for the user
async function saveReport(rep) {
  const r = await sb('/rest/v1/rpc/add_intel', { method: 'POST', body: { p: rep }, token: await getToken() })
  const who = rep.kind === 'spy' ? rep.name : rep.members.map((m) => m.name).join(' vs ')
  return `${rep.kind === 'spy' ? 'Spy report' : 'Combat report'} on ${who}. ${RESULT[r] ?? r}`
}

el('intel-go').onclick = async () => {
  const text = el('intel-paste').value.trim()
  if (!text) return (el('intel-msg').textContent = 'Paste a report first.')
  el('intel-go').disabled = true
  const lines = []
  const show = () => (el('intel-msg').textContent = lines.join('\n'))
  try {
    const ids = reportIds(text)
    if (ids) { // one or more report ids: look each one up
      for (const id of ids) {
        const rep = await fetchReport(id)
        lines.push(rep.error ?? (await saveReport(rep)))
        show()
      }
    } else { // a whole report page
      const rep = parseReport(text)
      lines.push(rep.error ?? (await saveReport(rep)))
    }
    el('intel-paste').value = ''
    loadIntel()
  } catch (e) {
    if (e.status === 401) return logout()
    lines.push(e.message)
  } finally {
    show()
    el('intel-go').disabled = false
  }
}
