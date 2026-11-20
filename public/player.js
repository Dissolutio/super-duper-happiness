// The Players screen: roster (known players, alliance lists, search) and the page for one player.
// Needs intel.js (intelRows, ago, VIA, TECH_NAMES), calc.js (world, loadCalc, calcFlightTo, calcSummary, fmtTime, showPlanets),
// flight.js (SHIPS), chat.js (coordChip) and app.js (el, esc, ALLIES, STATUS).

const roster = { filter: 'known', other: '' } // other: tag of the alliance shown in the second alliance's tab (blank = ALLIES[1])
const slotTag = (f) => (f === ALLIES[1] && roster.other ? roster.other : f)

// The API does not say which planet is the capital. The first planet a player gets is the lowest id, so that is the capital (checked against real players: it has matched every time).
const capitalOf = (planets) => planets.reduce((a, b) => (b.pid < a.pid ? b : a), planets[0])

// All planets left to right, galaxy by galaxy. Galaxies without planets shrink to a thin slot; a galaxy with planets
// zooms in on the systems it uses (system numbers at both ends), so planets close together get room.
// Moon = small dot, capital = star. With `pick`, each planet (with its moon) is a tap target and `pick` is selected.
function planetStrip(planets, pick) {
  if (!world || !planets.length) return ''
  const G = world.galaxies, S = world.systems, TW = 360, gap = 5, EMPTY = 16 // about one unit per screen pixel on a phone
  const cap = capitalOf(planets)
  const byG = new Map()
  for (const p of planets) { const g = Number(p.coords.split(':')[0]); if (!byG.has(g)) byG.set(g, []); byG.get(g).push(p) }
  const occW = (TW - gap * (G - 1) - EMPTY * (G - byG.size)) / Math.max(1, byG.size)
  let out = '', x0 = 0
  for (let g = 1; g <= G; g++) {
    const here = byG.get(g)
    const W = here ? occW : EMPTY
    out += `<line class="ps-axis" x1="${x0}" x2="${x0 + W}" y1="24" y2="24"/><text class="ps-g" x="${x0 + W / 2}" y="48">${g}</text>`
    if (here) {
      // the window of systems shown: the planets' range plus some room, at least 30 systems wide
      const ss = here.map((p) => Number(p.coords.split(':')[1]))
      let lo = Math.min(...ss), hi = Math.max(...ss)
      const pad = Math.max(6, (hi - lo) * 0.12)
      lo -= pad; hi += pad
      if (hi - lo < 30) { const mid = (lo + hi) / 2; lo = mid - 15; hi = mid + 15 }
      lo = Math.max(1, lo); hi = Math.min(S, hi)
      if (hi - lo < 30) { if (lo === 1) hi = Math.min(S, 31); else lo = Math.max(1, S - 30) }
      out += `<text class="ps-s" x="${x0 + 1}" y="37">${Math.round(lo)}</text><text class="ps-s end" x="${x0 + W - 1}" y="37">${Math.round(hi)}</text>`
      // place planets, then push apart any that would overlap (same or nearby systems)
      const placed = here.map((p) => ({ p, x: x0 + 5 + ((Number(p.coords.split(':')[1]) - lo) / (hi - lo)) * (W - 14), pos: Number(p.coords.split(':')[2]) }))
        .sort((a, b) => a.x - b.x || a.pos - b.pos)
      for (let i = 1; i < placed.length; i++) placed[i].x = Math.max(placed[i].x, placed[i - 1].x + 12)
      // and back from the right end, so the last ones stay inside their galaxy
      for (let i = placed.length - 1; i >= 0; i--) placed[i].x = Math.min(placed[i].x, i === placed.length - 1 ? x0 + W - 5 : placed[i + 1].x - 12)
      for (const { p, x: px } of placed) out += stripPlanet(p, px.toFixed(1), p === cap, pick)
    }
    x0 += W + gap
  }
  const moons = planets.filter((p) => p.moon).length
  const gates = planets.filter((p) => moonInfo(p.coords)?.gate).length
  return `<svg class="pstrip${pick !== undefined ? ' pick' : ''}" viewBox="-3 -12 ${TW + 6} 64" role="img" aria-label="${planets.length} planets, ${moons} moons, ${gates} jump gates">${out}</svg>`
}

function stripPlanet(p, x, isCap, pick) {
  let out = ''
  if (pick !== undefined) out += `<g class="ps-hit${p.coords === pick ? ' on' : ''}" data-coords="${esc(p.coords)}" role="button" aria-label="${esc(p.coords)}"><rect x="${(x - 6).toFixed(1)}" y="-12" width="17" height="46" rx="4"/>`
  out += isCap ? `<polygon class="ps-star" points="${starPoints(x, 24, 7.5)}"/>` : `<circle class="ps-planet" cx="${x}" cy="24" r="3.6"/>`
  if (p.moon) {
    const mx = (+x + 5).toFixed(1), info = moonInfo(p.coords)
    out += `<circle class="ps-moon" cx="${mx}" cy="15" r="2.4"/>`
    if (info?.gate) out += `<circle class="ps-gate" cx="${mx}" cy="15" r="4.4"/>` // jump gate: green ring round the moon
    if (info?.phalanx > 0) out += `<text class="ps-phx" x="${mx}" y="7">${info.phalanx}</text>` // phalanx level above it
  }
  return pick !== undefined ? out + '</g>' : out
}

// ---- what we know about one planet and its moon: spy scans, moon facilities, and the player's points ----
const SCAN_OLD = 3 * 864e5 // older than this is flagged: fleets move
const scansAt = (playerId, coords) => (typeof MAP !== 'undefined' ? MAP.scans?.get(String(playerId)) ?? [] : []).filter((x) => x.coords === coords)

function scanBlock(sc, where) {
  if (!sc) return `<p class="hint">No spy report of the ${where} yet.</p>`
  const old = Date.now() - sc.at > SCAN_OLD
  const war = sc.ships ? unitValue(sc.ships, SHIP_UNITS, (u) => u[2] === 'war') : null
  const ships = sc.ships ? unitList(sc.ships, SHIP_UNITS) : []
  const def = sc.defenseUnits ? unitList(sc.defenseUnits, DEFENSE_UNITS) : []
  const b = sc.buildings ?? {}
  const lv = (id) => b[id] ?? '-'
  const bld = where === 'moon'
    ? [41, 42, 43, 14].filter((id) => b[id] > 0).map((id) => `${BUILDING_NAMES[id]} ${b[id]}`).join(' · ')
    : Object.keys(b).length ? `Mines ${lv(1)}/${lv(2)}/${lv(3)} · Shipyard ${lv(21)} · Robotics ${lv(14)} · Nanite ${lv(15)}${b[44] ? ` · Missile Silo ${b[44]}` : ''}` : ''
  const pts = (v) => shortNum(v / 1000)
  return `
    <p class="hint${old ? ' old' : ''}">${old ? '&#9888; ' : ''}Spied ${ageText(sc.at)} ago${old ? ' (fleets may have moved since)' : ''}</p>
    <dl class="pd-grid">
      <div><dt>Fleet</dt><dd>${pts(sc.fleet)}${war != null ? ` <small>(${pts(war)} warships)</small>` : ''}</dd></div>
      <div><dt>Defence</dt><dd>${pts(sc.defense)}</dd></div>
      ${sc.resources != null ? `<div><dt>Resources</dt><dd>${shortNum(sc.resources)}</dd></div>` : ''}
    </dl>
    ${sc.ships ? `<p class="pd-list"><b>Ships:</b> ${ships.length ? esc(ships.join(', ')) : 'none seen'}</p>` : ''}
    ${sc.defenseUnits ? `<p class="pd-list"><b>Defence:</b> ${def.length ? esc(def.join(', ')) : 'none seen'}</p>` : ''}
    ${bld ? `<p class="pd-list"><b>Buildings:</b> ${esc(bld)}</p>` : ''}
    ${!sc.ships && !sc.defenseUnits ? '<p class="hint">Only the totals were kept for this report. Paste the report page to keep the breakdown.</p>' : ''}`
}

function planetDetail(playerId, coords) {
  const pl = (world.byPlayer.get(playerId) ?? []).find((x) => x.coords === coords)
  if (!pl) return '<p class="hint">Tap a planet above to see what we know about it.</p>'
  const scans = scansAt(playerId, coords)
  const onPlanet = scans.find((x) => !x.moon), onMoon = scans.find((x) => x.moon)
  const info = moonInfo(coords)
  const st = typeof playerStats === 'function' ? playerStats(playerId) : null
  const sc = typeof scanOf === 'function' ? scanOf(playerId) : null
  const r = intelRows?.find?.((x) => String(x.player_id) === String(playerId))
  const t = r?.tech ?? {}
  return `
    <h4>${coordChip(...coords.split(':'))} ${esc(pl.name)}${pl.moon ? ' &#9790;' : ''}</h4>
    <h5>Planet</h5>
    ${scanBlock(onPlanet, 'planet')}
    ${pl.moon ? `<h5>Moon${info ? ` <small class="moon-tags">${esc(moonText(coords))}</small>` : ''}</h5>
    ${scanBlock(onMoon, 'moon')}` : ''}
    <h5>Whole account</h5>
    <p class="pd-list">${st ? `Military ${shortNum(st.mil ?? 0)} points (fleet and defence together, ${Math.round(st.fleetShare * 100)}% of ${shortNum(st.total)}).` : 'No highscore data.'}
    ${sc ? ` Scans in the last 14 days were ${Math.round(sc.shipShare * 100)}% ships, so roughly <b>${shortNum((st?.mil ?? 0) * sc.shipShare)} points of fleet</b>.` : ''}</p>
    ${r?.tech_at ? `<p class="pd-list">Combat tech: weapons ${t[109] ?? '?'}, shields ${t[110] ?? '?'}, armour ${t[111] ?? '?'} <small>(${ago(r.tech_at)})</small></p>` : ''}`
}

// what we know about the moon at these coordinates: { gate, phalanx } (from the map's moon list), or null
const moonInfo = (coords) => (typeof MAP !== 'undefined' ? MAP.moons.get(coords) : null) ?? null
// short text for planet rows: "moon, jump gate, phalanx 5"
function moonText(coords) {
  const m = moonInfo(coords)
  return [m?.gate ? 'jump gate' : '', m?.phalanx > 0 ? `phalanx ${m.phalanx}` : ''].filter(Boolean).join(', ')
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
  if (typeof ensureMoons === 'function' && !MAP.moonsAt) ensureMoons(() => renderRoster())
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
  if (typeof ensureMoons === 'function') await Promise.all([ensureMoons(), ensureScans()]) // gates, phalanx levels and spy scans for the planets
  PLAYER_PICK.id = String(id)
  PLAYER_PICK.coords = null
  const p = playerEntry(id)
  const r = p.row
  const t = r?.tech ?? {}
  const planets = world?.byPlayer.get(p.id) ?? []
  const hasFrom = !!el('fc-from').value.trim()
  const planetRows = planets.map((x) => {
    const [g, s, pos] = x.coords.split(':')
    const secs = calcFlightTo(x.coords)
    const mt = x.moon ? moonText(x.coords) : ''
    return `<div class="planet-row pick" data-coords="${esc(x.coords)}">${coordChip(g, s, pos)} <span>${esc(x.name)}${x.moon ? ' &#9790;' : ''}${mt ? ` <small class="moon-tags">${esc(mt)}</small>` : ''}</span>${secs != null ? `<span class="t">${fmtTime(secs)}</span>` : ''}</div>`
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
    <div id="pp-strip">${planetStrip(planets, null)}</div>
    ${planets.length ? '<p class="hint">Star = capital. Small dot = moon, a green ring round it = jump gate, a green number above it = phalanx level. Empty galaxies are squeezed; numbers under a galaxy are the systems shown. Tap a planet (or a row below) for what we know about it.</p>' : ''}
    <div id="planet-detail" class="planet-detail" hidden></div>
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

// which planet is picked on the player page
const PLAYER_PICK = { id: null, coords: null }
function pickPlanet(coords) {
  PLAYER_PICK.coords = PLAYER_PICK.coords === coords ? null : coords // tap again to close
  const planets = world?.byPlayer.get(PLAYER_PICK.id) ?? []
  el('pp-strip').innerHTML = planetStrip(planets, PLAYER_PICK.coords)
  const d = el('planet-detail')
  d.hidden = !PLAYER_PICK.coords
  d.innerHTML = PLAYER_PICK.coords ? planetDetail(PLAYER_PICK.id, PLAYER_PICK.coords) : ''
  for (const row of el('player-page').querySelectorAll('.planet-row')) row.classList.toggle('on', row.dataset.coords === PLAYER_PICK.coords)
  if (PLAYER_PICK.coords && d.getBoundingClientRect().top > innerHeight * 0.6) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

el('player-page').onclick = (e) => {
  if (e.target.closest('#player-back')) return closePlayer()
  const hit = e.target.closest('.ps-hit, .planet-row.pick')
  if (hit && !e.target.closest('a, button.coord, .coord')) return pickPlanet(hit.dataset.coords)
  if (e.target.closest('#player-calc')) {
    el('fc-player').value = el('player-page').querySelector('h2').textContent
    showPlanets()
    closePlayer()
    el('calc').open = true
    el('calc').scrollIntoView()
  }
}
