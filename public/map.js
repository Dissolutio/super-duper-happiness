// The war map. Top down, drawn as SVG from the universe data (the same data the flight calculator uses).
// Universe view: the 7 galaxies sit on a ring, because galaxy 7 is next to galaxy 1 on this server (it wraps around).
// Galaxy view: one galaxy as a ring of 499 systems (system 499 is next to system 1); a planet's distance from the middle is its
// planet number (1 inside, 15 outside). Planets are coloured by alliance, a moon is a small dot beside its planet, and flights
// that have a known launch planet are drawn as arrows.
// Needs calc.js (world, loadCalc), flight.js (ownerAt), landings.js (landings, loadLandings), chat.js (coordChip, showView),
// player.js (slotTag, openPlayer) and app.js (el, esc, ALLIES).

const MAP = { galaxy: 0, pl: null, picked: null, selected: null, moons: new Map(), preview: null } // galaxy 0 = the whole universe; moons: coords -> { gate, phalanx }
const TAU = Math.PI * 2

// every planet in the universe as { g, s, p, name, moon, owner } (built once per loaded universe)
function mapPlanets() {
  if (MAP.pl?.world === world) return MAP.pl.list
  const list = []
  for (const [owner, planets] of world.byPlayer) {
    for (const x of planets) {
      const [g, s, p] = x.coords.split(':').map(Number)
      list.push({ g, s, p, name: x.name, moon: x.moon, owner, coords: x.coords })
    }
  }
  MAP.pl = { world, list }
  return list
}

// css class for a planet: which alliance it belongs to
function mapClass(ownerId) {
  const o = world.byId.get(ownerId)
  const tag = (o?.alliance ?? '').toLowerCase()
  const inactive = /[iI]/.test(o?.status ?? '') ? ' m-idle' : ''
  if (tag && tag === ALLIES[0].toLowerCase()) return 'm-a0' + inactive
  if (tag && tag === slotTag(ALLIES[1]).toLowerCase()) return 'm-a1' + inactive
  return (tag ? 'm-other' : 'm-none') + inactive
}

const ang = (s) => ((s - 1) / world.systems) * TAU - Math.PI / 2
const polar = (cx, cy, r, s) => [cx + r * Math.cos(ang(s)), cy + r * Math.sin(ang(s))]
const f1 = (n) => n.toFixed(1)

// where each galaxy sits in the universe view
function galaxyCentre(g) {
  const a = -Math.PI / 2 + ((g - 1) * TAU) / world.galaxies
  return [200 + 125 * Math.cos(a), 200 + 125 * Math.sin(a)]
}
const UNI_R = 48 // radius of a galaxy ring in the universe view
const GAL_R0 = 100, GAL_R1 = 185 // inner (planet 1) and outer (planet 15) radius in the galaxy view

// where a coordinate is drawn in the current view, or null if it is not on screen
function mapPoint(g, s, p) {
  if (MAP.galaxy === 0) {
    const [cx, cy] = galaxyCentre(g)
    return polar(cx, cy, UNI_R, s)
  }
  if (g !== MAP.galaxy) return null
  return polar(200, 200, GAL_R0 + ((Math.min(p, 15) - 1) / 14) * (GAL_R1 - GAL_R0), s)
}

async function loadMoons() {
  try {
    const rows = await sb('/rest/v1/moons?select=galaxy,system,position,gate,phalanx', { token: await getToken() })
    MAP.moons = new Map(rows.map((m) => [`${m.galaxy}:${m.system}:${m.position}`, m]))
  } catch (e) {
    if (e.status === 401) return logout()
    el('map-hint').textContent = 'Could not load moon info: ' + e.message // the map still works without it
  }
}

// phalanx range in systems: level squared minus one (level 1 = its own system only)
const phalanxRange = (level) => Math.max(0, level * level - 1)

// systems apart, going the short way round when the server wraps systems
function sysDistance(a, b) {
  const d = Math.abs(a - b)
  return world.donutSystem ? Math.min(d, world.systems - d) : d
}

// the wedge of the galaxy ring a phalanx on this moon can see
function phalanxWedge(g, s, level) {
  if (MAP.galaxy !== g || level == null) return ''
  const range = phalanxRange(level)
  const half = TAU / world.systems / 2
  if (range * 2 + 1 >= world.systems) return `<circle class="m-wedge" cx="200" cy="200" r="${(GAL_R0 + GAL_R1) / 2}" stroke-width="${GAL_R1 - GAL_R0 + 12}"/>`
  const [r0, r1] = [GAL_R0 - 6, GAL_R1 + 6]
  const a0 = ang(s - range) - half, a1 = ang(s + range) + half
  const pt = (r, a) => `${f1(200 + r * Math.cos(a))} ${f1(200 + r * Math.sin(a))}`
  const big = (range * 2 + 1) / world.systems > 0.5 ? 1 : 0
  return `<path class="m-wedge-fill" d="M${pt(r1, a0)} A${r1} ${r1} 0 ${big} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${big} 0 ${pt(r0, a0)} Z"/>`
}

// jump gates: a ring round each gate moon, and a faint line between the gates of one player
function mapGates() {
  let rings = '', lines = ''
  const byOwner = new Map()
  for (const [coords, m] of MAP.moons) {
    if (!m.gate) continue
    const owner = world.at.get(coords)
    if (!owner) continue
    if (!byOwner.has(owner)) byOwner.set(owner, [])
    byOwner.get(owner).push(coords)
  }
  for (const list of byOwner.values()) {
    const pts = list.map((c) => { const [g, s, p] = c.split(':').map(Number); return mapPoint(g, s, p) })
    for (const q of pts) if (q) rings += `<circle class="m-gate" cx="${f1(q[0] + (MAP.galaxy ? 3.4 : 0))}" cy="${f1(q[1] - (MAP.galaxy ? 3.4 : 0))}" r="${MAP.galaxy ? 3 : 2.4}"/>`
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      if (pts[i] && pts[j]) lines += `<line class="m-gateline" x1="${f1(pts[i][0])}" y1="${f1(pts[i][1])}" x2="${f1(pts[j][0])}" y2="${f1(pts[j][1])}"/>`
    }
  }
  return lines + rings
}

// flights with a known launch planet, as arrows from there to the target
function mapArrows() {
  if (typeof landings === 'undefined') return ''
  const since = Date.now() - SHOW_LANDED_MIN * 60000
  let out = ''
  for (const l of landings) {
    if (!l.origin_galaxy || new Date(l.arrives_at) < since) continue
    const a = mapPoint(l.origin_galaxy, l.origin_system, l.origin_position)
    const b = mapPoint(l.galaxy, l.system, l.position)
    if (!a || !b) continue
    const cat = l.category ?? (l.side === 'theirs' ? 'alert' : 'info')
    // bend the line towards the middle so arrows between rings do not run straight through other rings
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const c = [mid[0] + (200 - mid[0]) * 0.3, mid[1] + (200 - mid[1]) * 0.3]
    out += `<path class="m-arrow ${cat}" d="M${f1(a[0])} ${f1(a[1])} Q${f1(c[0])} ${f1(c[1])} ${f1(b[0])} ${f1(b[1])}" marker-end="url(#arr-${cat})"/>`
  }
  return out
}

const MAP_DEFS = ['alert', 'opportunity', 'info']
  .map((c) => `<marker id="arr-${c}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="m-head ${c}" d="M0 0 L10 5 L0 10 z"/></marker>`).join('')

function renderMap(keepInfo) {
  if (!world) return (el('map-svg').innerHTML = '')
  const list = mapPlanets()
  let body = ''
  if (MAP.galaxy === 0) {
    for (let g = 1; g <= world.galaxies; g++) {
      const [cx, cy] = galaxyCentre(g)
      body += `<g class="m-gal" data-g="${g}"><circle class="m-ring" cx="${f1(cx)}" cy="${f1(cy)}" r="${UNI_R}"/><circle class="m-hit" cx="${f1(cx)}" cy="${f1(cy)}" r="${UNI_R + 6}"/><text class="m-glabel" x="${f1(cx)}" y="${f1(cy + 4)}">${g}</text></g>`
    }
    for (const x of list) {
      const [px, py] = mapPoint(x.g, x.s, x.p)
      body += `<circle class="m-dot ${mapClass(x.owner)}" cx="${f1(px)}" cy="${f1(py)}" r="${x.moon ? 1.5 : 1.1}"/>`
    }
  } else {
    body += `<circle class="m-ring" cx="200" cy="200" r="${GAL_R0 - 6}"/><circle class="m-ring m-faint" cx="200" cy="200" r="${(GAL_R0 + GAL_R1) / 2}"/><circle class="m-ring" cx="200" cy="200" r="${GAL_R1 + 6}"/>`
    body += `<text class="m-glabel big" x="200" y="214">${MAP.galaxy}</text>`
    for (let s = 50; s <= world.systems; s += 50) { // a tick and a number every 50 systems, so you can read your way around
      const [x1, y1] = polar(200, 200, GAL_R0 - 6, s), [x2, y2] = polar(200, 200, GAL_R0 - 12, s), [tx, ty] = polar(200, 200, GAL_R0 - 22, s)
      body += `<line class="m-tick" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/><text class="m-num" x="${f1(tx)}" y="${f1(ty + 2.5)}">${s}</text>`
    }
    const sel = MAP.selected ? MAP.selected.split(':').map(Number) : null
    const level = MAP.preview ?? MAP.moons.get(MAP.selected)?.phalanx
    if (sel && level != null) body += phalanxWedge(sel[0], sel[1], level)
    const here = list.filter((x) => x.g === MAP.galaxy)
    // the picked player's planets are joined by a faint line, so you can see how they connect
    if (MAP.picked) {
      const mine = here.filter((x) => x.owner === MAP.picked).map((x) => mapPoint(x.g, x.s, x.p))
      if (mine.length > 1) body += `<polygon class="m-link" points="${mine.map((q) => q.map(f1).join(',')).join(' ')}"/>`
    }
    for (const x of here) {
      const [px, py] = mapPoint(x.g, x.s, x.p)
      const on = x.owner === MAP.picked ? ' m-on' : ''
      body += `<g class="m-planet" data-c="${x.coords}"><circle class="m-hit" cx="${f1(px)}" cy="${f1(py)}" r="6"/><circle class="m-dot ${mapClass(x.owner)}${on}" cx="${f1(px)}" cy="${f1(py)}" r="2.4"/>`
      if (x.moon) body += `<circle class="m-moon" cx="${f1(px + 3.4)}" cy="${f1(py - 3.4)}" r="1.3"/>`
      body += '</g>'
    }
  }
  el('map-svg').innerHTML = `<defs>${MAP_DEFS}</defs>${body}${mapGates()}${mapArrows()}`
  el('map-tabs').innerHTML = [0, ...Array.from({ length: world.galaxies }, (_, i) => i + 1)]
    .map((g) => `<button data-g="${g}" class="${g === MAP.galaxy ? 'active' : ''}">${g === 0 ? 'All' : g}</button>`).join('')
  el('map-legend').innerHTML = `<span class="m-a0">&#9679;</span> ${esc(ALLIES[0])} <span class="m-a1">&#9679;</span> ${esc(slotTag(ALLIES[1]))} <span class="m-other">&#9679;</span> others <span class="m-moon-key">&#9679;</span> moon <span class="m-gate-key">&#9675;</span> jump gate`
  el('map-hint').textContent = MAP.galaxy === 0 ? 'Tap a galaxy to open it. Arrows are flights with a known launch planet.' : 'Planet 1 is the inner edge, planet 15 the outer. Tap a planet.'
  if (!keepInfo) showPicked()
}

// details for the tapped planet, under the map
function showPicked() {
  const box = el('map-info')
  const sel = MAP.selected && world.at.get(MAP.selected)
  if (!sel) return (box.innerHTML = '')
  const o = world.byId.get(sel)
  const pl = world.byPlayer.get(sel)?.find((x) => x.coords === MAP.selected)
  const [g, s, p] = MAP.selected.split(':')
  const known = MAP.moons.get(MAP.selected)
  const level = MAP.preview ?? known?.phalanx
  box.innerHTML = `
    <div class="card"><div class="top"><span class="name">${esc(pl?.name ?? '?')}${pl?.moon ? ' &#9790;' : ''}</span>${coordChip(g, s, p)}</div>
    <p class="hint">${esc(o?.name ?? '?')}${o?.alliance ? ` (${esc(o.alliance)})` : ''} · ${world.byPlayer.get(sel)?.length ?? 0} planets</p>
    ${pl?.moon ? `
      <div class="moon-form">
        <label class="check"><input type="checkbox" id="moon-gate" ${known?.gate ? 'checked' : ''}> Has a jump gate</label>
        <label>Phalanx level <input id="moon-phalanx" type="number" inputmode="numeric" min="0" max="40" value="${known?.phalanx ?? ''}" placeholder="unknown"></label>
        <button type="button" id="moon-save">Save moon</button>
      </div>
      <p id="map-msg" class="msg"></p>
      <div id="moon-report">${moonReport(MAP.selected, level)}</div>` : '<p id="map-msg" class="msg"></p>'}
    <button type="button" id="map-player" data-id="${esc(sel)}">Open player</button></div>`
}

const moonReport = (coords, level) => (level != null ? phalanxReport(coords, level) : '<p class="hint">Enter a phalanx level to see what it can scan.</p>')

// what a phalanx at these coordinates can scan: planets only, same galaxy, within level^2 - 1 systems
function phalanxReport(coords, level) {
  const [g, s] = coords.split(':').map(Number)
  const range = phalanxRange(level)
  const hit = mapPlanets().filter((x) => x.g === g && x.owner !== world.at.get(coords) && sysDistance(x.s, s) <= range)
  const tagOf = (x) => (world.byId.get(x.owner)?.alliance ?? '').toLowerCase()
  const them = hit.filter((x) => tagOf(x) === slotTag(ALLIES[1]).toLowerCase())
  const ours = hit.filter((x) => tagOf(x) === ALLIES[0].toLowerCase())
  const list = them.slice(0, 15).map((x) => `<div class="planet-row">${coordChip(x.g, x.s, x.p)} <span>${esc(x.name)} (${esc(world.byId.get(x.owner)?.name ?? '?')})</span></div>`).join('')
  return `<p class="hint">Level ${level}: sees ${range} system${range === 1 ? '' : 's'} each way. ${hit.length} planet${hit.length === 1 ? '' : 's'} in range: ${ours.length} ${esc(ALLIES[0])}, ${them.length} ${esc(slotTag(ALLIES[1]))}, ${hit.length - ours.length - them.length} others.</p>${list}${them.length > 15 ? `<p class="hint">...and ${them.length - 15} more.</p>` : ''}`
}

el('map-tabs').onclick = (e) => {
  const b = e.target.closest('button')
  if (!b) return
  MAP.galaxy = Number(b.dataset.g)
  MAP.selected = null
  MAP.picked = null
  renderMap()
}
el('map-svg').onclick = (e) => {
  const gal = e.target.closest('.m-gal')
  if (gal) { MAP.galaxy = Number(gal.dataset.g); MAP.selected = null; MAP.picked = null; return renderMap() }
  const pl = e.target.closest('.m-planet')
  if (!pl) return
  MAP.selected = pl.dataset.c
  MAP.preview = null
  MAP.picked = world.at.get(MAP.selected) ?? null
  renderMap()
}
el('map-info').onclick = async (e) => {
  if (e.target.closest('#moon-save')) {
    const [g, s, p] = MAP.selected.split(':').map(Number)
    const lv = el('moon-phalanx').value
    const level = lv === '' ? null : Number(lv)
    if (level !== null && !(Number.isInteger(level) && level >= 0 && level <= 40)) return (el('map-msg').textContent = 'Phalanx level must be a whole number from 0 to 40.')
    try {
      await sb('/rest/v1/rpc/set_moon', { method: 'POST', token: await getToken(), body: { p_galaxy: g, p_system: s, p_position: p, p_gate: el('moon-gate').checked, p_phalanx: level } })
      MAP.preview = null
      await loadMoons()
      renderMap()
      el('map-msg').textContent = 'Saved.'
    } catch (err) {
      if (err.status === 401) return logout()
      el('map-msg').textContent = err.message
    }
    return
  }
  const b = e.target.closest('#map-player')
  if (!b) return
  showView('players')
  openPlayer(b.dataset.id)
}
// typing a level shows its reach straight away, before it is saved
el('map-info').oninput = (e) => {
  if (e.target.id !== 'moon-phalanx') return
  const v = e.target.value
  MAP.preview = v !== '' && Number.isInteger(Number(v)) && v >= 0 && v <= 40 ? Number(v) : null
  renderMap(true) // redraw the map only, so the box being typed in is left alone
  el('moon-report').innerHTML = moonReport(MAP.selected, MAP.preview ?? MAP.moons.get(MAP.selected)?.phalanx)
}

async function openMap() {
  el('map-hint').textContent = 'Loading universe data...'
  await loadCalc()
  await Promise.all([typeof loadLandings === 'function' ? loadLandings() : 0, loadMoons()]) // arrows, gates and phalanx levels
  renderMap()
}
