// The Players screen: roster (known players, alliance lists, search) and the page for one player.
// Needs intel.js (intelRows, ago, VIA, TECH_NAMES), calc.js (world, loadCalc, calcFlightTo, calcSummary, fmtTime, showPlanets),
// flight.js (SHIPS), chat.js (coordChip) and app.js (el, esc, ALLIES, STATUS).

const roster = { filter: 'known' }

// one entry per player we can show: what the universe says (if loaded) plus what we know from reports
function playerEntry(id, fallbackName = '?') {
  const w = world?.players.find((p) => p.id === String(id))
  const row = intelRows.find((r) => String(r.player_id) === String(id))
  return { id: String(id), name: w?.name ?? row?.name ?? fallbackName, tag: w?.alliance ?? '', status: w?.status ?? '', row }
}

function rosterEntries() {
  const q = el('roster-search').value.trim().toLowerCase()
  const everyone = () => (world ? world.players.map((p) => playerEntry(p.id)) : intelRows.map((r) => playerEntry(r.player_id)))
  let list
  if (q.length >= 2) list = everyone().filter((p) => p.name.toLowerCase().includes(q)).slice(0, 40)
  else if (roster.filter === 'known') list = intelRows.map((r) => playerEntry(r.player_id))
  else list = everyone().filter((p) => p.tag.toLowerCase() === roster.filter.toLowerCase())
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

function renderRoster() {
  el('roster-tabs').innerHTML = [['known', 'Known'], ...ALLIES.map((a) => [a, a])]
    .map(([f, label]) => `<button data-f="${esc(f)}" class="${f === roster.filter ? 'active' : ''}">${esc(label)}</button>`).join('')
  const list = rosterEntries()
  const searching = el('roster-search').value.trim().length >= 2
  const withReport = list.filter((p) => p.row?.tech_at).length
  el('roster-note').textContent = searching ? `${list.length} match${list.length === 1 ? '' : 'es'}`
    : roster.filter === 'known' ? `${list.length} player${list.length === 1 ? '' : 's'} with a report`
    : world ? `${withReport} of ${list.length} have a spy report` : 'Loading universe data...'
  el('intel-list').innerHTML = list.length ? list.map(playerCard).join('')
    : `<p class="empty">${roster.filter === 'known' && !searching ? 'No players yet. Paste a spy report above.' : 'Nobody to show.'}</p>`
}

const statusText = (st) => [...st].map((c) => STATUS[c]).filter(Boolean).join(', ')

function playerCard(p) {
  const r = p.row
  const t = r?.tech ?? {}
  const lv = (id) => t[id] ?? '?'
  const c = ALLIES.findIndex((a) => a.toLowerCase() === p.tag.toLowerCase())
  const sub = [p.tag, r?.character_class, statusText(p.status)].filter(Boolean).join(' · ')
  return `
    <div class="card pcard ${c >= 0 ? 'c' + c : ''}" data-id="${esc(p.id)}">
      <div class="top"><span class="name">${esc(p.name)}</span><span class="rank">${esc(sub)}</span></div>
      ${r?.tech_at ? `
        <dl>
          <div><dt>Combustion</dt><dd>${lv(115)}</dd></div>
          <div><dt>Impulse</dt><dd>${lv(117)}</dd></div>
          <div><dt>Hyperspace</dt><dd>${lv(118)}</dd></div>
          <div><dt>Weapons</dt><dd>${lv(109)}</dd></div>
          <div><dt>Shields</dt><dd>${lv(110)}</dd></div>
          <div><dt>Armour</dt><dd>${lv(111)}</dd></div>
        </dl>
        <div class="hint">Spy report ${ago(r.tech_at)}${VIA[r.tech_via] ?? ''}</div>`
      : '<div class="hint">No spy report yet</div>'}
    </div>`
}

el('roster-tabs').onclick = (e) => {
  const b = e.target.closest('button')
  if (!b) return
  roster.filter = b.dataset.f
  el('roster-search').value = ''
  renderRoster()
}
el('roster-search').oninput = renderRoster
el('intel-list').onclick = (e) => {
  const card = e.target.closest('.pcard')
  if (card) openPlayer(card.dataset.id)
}

// ---- the page for one player ----

async function openPlayer(id) {
  if (!world) await loadCalc()
  const p = playerEntry(id)
  const r = p.row
  const t = r?.tech ?? {}
  const planets = world?.byPlayer.get(p.id) ?? []
  const hasFrom = !!el('fc-from').value.trim()
  const planetRows = planets.map((x) => {
    const [g, s, pos] = x.coords.split(':')
    const secs = calcFlightTo(x.coords)
    return `<div class="planet-row">${coordChip(g, s, pos)} <span>${esc(x.name)}${x.moon ? ' &#9790;' : ''}</span>${secs != null ? `<span class="t">${fmtTime(secs)}</span>` : ''}</div>`
  }).join('')
  const speeds = SHIPS.filter((s) => r?.speed_bonus?.[s.id] != null).map((s) => `${esc(s.name)} ${r.speed_bonus[s.id]}%`).join(' &middot; ')
  const c = r?.combat_pct ?? {}
  el('player-page').innerHTML = `
    <button id="player-back">&larr; Back</button>
    <h2>${esc(p.name)}</h2>
    <p class="hint">${esc([p.tag, r?.character_class, statusText(p.status)].filter(Boolean).join(' · ') || 'no alliance')}</p>

    <h3>Tech</h3>
    ${r?.tech_at ? `
      <dl class="tech-grid">${Object.entries(TECH_NAMES).map(([id, name]) => `<div><dt>${esc(name)}</dt><dd>${t[id] ?? '?'}</dd></div>`).join('')}</dl>
      <p class="hint">Spy report ${ago(r.tech_at)}${VIA[r.tech_via] ?? ''}</p>
      ${speeds ? `<p class="hint">Lifeform speed: ${speeds}</p>` : ''}`
    : '<p class="hint">No spy report yet. Paste one on this screen and it shows up here.</p>'}
    ${r?.combat_at ? `<p class="hint">Last fight ${ago(r.combat_at)}${VIA[r.combat_via] ?? ''}: weapons ${esc(c.weapon ?? '?')}%, shields ${esc(c.shield ?? '?')}%, armour ${esc(c.armor ?? '?')}%</p>` : ''}

    <h3>Planets${world ? ` (${planets.length})` : ''}</h3>
    ${world ? (planets.length ? `
      <p class="hint">${hasFrom ? `Flight times ${esc(calcSummary())}. Change them in the flight calculator.` : 'Fill in From in the flight calculator to see flight times here.'}</p>
      ${planetRows}` : '<p class="hint">No planets known for this player.</p>')
    : '<p class="hint">Universe data did not load.</p>'}
    <p><button id="player-calc">Open in flight calculator</button></p>`
  el('intel-main').hidden = true
  el('player-page').hidden = false
  window.scrollTo(0, 0)
}

function closePlayer() {
  el('player-page').hidden = true
  el('intel-main').hidden = false
}

el('player-page').onclick = (e) => {
  if (e.target.closest('#player-back')) return closePlayer()
  if (e.target.closest('#player-calc')) {
    el('fc-player').value = el('player-page').querySelector('h2').textContent
    showPlanets()
    closePlayer()
    el('calc').open = true
    el('calc').scrollIntoView()
  }
}
