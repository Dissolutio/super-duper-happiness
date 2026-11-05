// The Players screen: roster (known players, alliance lists, search) and the page for one player.
// Needs intel.js (intelRows, ago, VIA, TECH_NAMES), calc.js (world, loadCalc, calcFlightTo, calcSummary, fmtTime, showPlanets),
// flight.js (SHIPS), chat.js (coordChip) and app.js (el, esc, ALLIES, STATUS).

const roster = { filter: 'known', other: '' } // other: tag of the alliance shown in the second alliance's tab (blank = ALLIES[1])
const slotTag = (f) => (f === ALLIES[1] && roster.other ? roster.other : f)

// The API does not say which planet is the capital. The first planet a player gets is the lowest id, so we guess that one.
const capitalOf = (planets) => planets.reduce((a, b) => (b.pid < a.pid ? b : a), planets[0])

// All planets left to right: galaxy 1 to 7, each galaxy's width is its systems. Moon = small dot, capital = star.
function planetStrip(planets) {
  if (!world || !planets.length) return ''
  const G = world.galaxies, S = world.systems, W = 100, gap = 4
  const cap = capitalOf(planets)
  let out = ''
  for (let g = 1; g <= G; g++) {
    const x0 = (g - 1) * (W + gap)
    out += `<line class="ps-axis" x1="${x0}" x2="${x0 + W}" y1="24" y2="24"/><text class="ps-g" x="${x0 + W / 2}" y="52">${g}</text>`
  }
  for (const p of planets) {
    const [g, s] = p.coords.split(':').map(Number)
    const x = ((g - 1) * (W + gap) + ((s - 1) / (S - 1)) * W).toFixed(1)
    if (p === cap) out += `<polygon class="ps-star" points="${starPoints(x, 24, 11)}"/>`
    else out += `<circle class="ps-planet" cx="${x}" cy="24" r="4.5"/>`
    if (p.moon) out += `<circle class="ps-moon" cx="${(+x + 7).toFixed(1)}" cy="14" r="3.2"/>`
  }
  const moons = planets.filter((p) => p.moon).length
  return `<svg class="pstrip" viewBox="0 0 ${G * (W + gap) - gap} 58" role="img" aria-label="${planets.length} planets, ${moons} moons">${out}</svg>`
}

function starPoints(cx, cy, r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r
    pts.push(`${(+cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

// the alliance box: type a tag or name, and that alliance takes the second tab
function fillAllianceList() {
  el('alliance-list').innerHTML = (world?.alliances ?? []).map((a) => `<option value="${esc(a.tag)}">${esc(a.name)}</option>`).join('')
}
function pickAlliance() {
  const v = el('alliance-search').value.trim().toLowerCase()
  const a = v && world?.alliances.find((x) => x.tag.toLowerCase() === v) || v.length > 2 && world?.alliances.find((x) => x.name.toLowerCase() === v)
  roster.other = a && a.tag.toLowerCase() !== ALLIES[1].toLowerCase() ? a.tag : ''
  if (a || !v) roster.filter = ALLIES[1]
  el('roster-search').value = ''
  renderRoster()
}

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
  else list = everyone().filter((p) => p.tag.toLowerCase() === slotTag(roster.filter).toLowerCase())
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

function renderRoster() {
  if (world && !el('alliance-list').children.length) fillAllianceList()
  el('roster-tabs').innerHTML = [['known', 'Known'], ...ALLIES.map((a) => [a, slotTag(a)])]
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
  const c = ALLIES.findIndex((a) => slotTag(a).toLowerCase() === p.tag.toLowerCase())
  const sub = [p.tag, r?.character_class, statusText(p.status)].filter(Boolean).join(' · ')
  return `
    <div class="card pcard ${c >= 0 ? 'c' + c : ''}" data-id="${esc(p.id)}">
      <div class="top"><span class="name">${esc(p.name)}</span><span class="rank">${esc(sub)}</span></div>
      ${planetStrip(world?.byPlayer.get(p.id) ?? [])}
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
el('alliance-search').onchange = pickAlliance
el('alliance-search').oninput = () => { if (!el('alliance-search').value) pickAlliance() }
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
    ${planetStrip(planets)}
    ${planets.length ? '<p class="hint">Star = capital (our guess: the oldest planet). Small dot = moon.</p>' : ''}
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
