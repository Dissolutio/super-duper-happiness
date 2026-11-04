// Players screen: what we know about each player from pasted reports.
// A newer report always replaces older data (decided in the database, see supabase/intel.sql).
// Needs auth.js (sb, getToken), app.js (el, esc), reports.js (parseReport) and gate.js (logout).

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
        ${r.tech_at ? `<div class="hint">Tech from a spy report ${ago(r.tech_at)}</div>` : '<div class="hint">No spy report yet</div>'}
        ${bonus ? `<div class="hint">Lifeform speed: ${bonus}</div>` : ''}
        ${r.combat_at ? `<div class="hint">Last fight ${ago(r.combat_at)}: weapons ${esc(c.weapon ?? '?')}%, shields ${esc(c.shield ?? '?')}%, armour ${esc(c.armor ?? '?')}%</div>` : ''}
      </div>`
  }).join('')
}

const RESULT = {
  added: 'Saved.',
  older: 'Saved, but we already had newer data for that player, so the profile was not changed.',
  duplicate: 'That report was already added.',
}

el('intel-go').onclick = async () => {
  const msg = (t) => (el('intel-msg').textContent = t)
  const text = el('intel-paste').value.trim()
  if (!text) return msg('Paste a report first.')
  const rep = parseReport(text)
  if (rep.error) return msg(rep.error)
  el('intel-go').disabled = true
  try {
    const r = await sb('/rest/v1/rpc/add_intel', { method: 'POST', body: { p: rep }, token: await getToken() })
    const who = rep.kind === 'spy' ? rep.name : rep.members.map((m) => m.name).join(' vs ')
    msg(`${rep.kind === 'spy' ? 'Spy report' : 'Combat report'} on ${who}. ${RESULT[r] ?? r}`)
    el('intel-paste').value = ''
    loadIntel()
  } catch (e) {
    if (e.status === 401) return logout()
    msg(e.message)
  } finally {
    el('intel-go').disabled = false
  }
}
