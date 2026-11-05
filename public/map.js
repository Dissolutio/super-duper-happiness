// The war map. Top down, drawn as SVG from the universe data (the same data the flight calculator uses).
// Universe view: the 7 galaxies sit on a ring, because galaxy 7 is next to galaxy 1 on this server (it wraps around).
// Galaxy view: one galaxy as a ring of 499 systems (system 499 is next to system 1); a planet's distance from the middle is its
// planet number (1 inside, 15 outside). Planets are coloured by alliance, a moon is a small dot beside its planet, and flights
// that have a known launch planet are drawn as arrows.
//
// Zoom: pinch, double-tap, mouse wheel or the + / - buttons, up to 12x. Drag to move around. A small overview in the corner
// shows where you are. While a finger is moving only the view box changes (fast); when it lets go the map is redrawn for that
// zoom: dots grow a little, names and system numbers appear, and only what is near the screen is drawn.
//
// Needs calc.js (world, loadCalc), flight.js (ownerAt), landings.js (landings, loadLandings, SHOW_LANDED_MIN), chat.js
// (coordChip, showView), player.js (slotTag, openPlayer) and app.js (el, esc, ALLIES).

const MAP = {
  galaxy: 0, pl: null, picked: null, selected: null, moons: new Map(), preview: null, // galaxy 0 = the whole universe; moons: coords -> { gate, phalanx }
  view: { cx: 200, cy: 200, k: 1 }, // centre of the screen in map units, and zoom
  find: null, // player id found with the search box: their planets are ringed
  all: false, // false = hide the players we do not care about (see isRelevant); true = show everyone
}
const TAU = Math.PI * 2
const MAX_ZOOM = 12

// Who is worth drawing. Always: DONUT, the second tab's alliance, and whoever is picked / found / selected.
// Hidden by default: inactive players, and players with no alliance who are weaker than our weakest DONUT player.
// (Players in other alliances stay, unless inactive: they may end up on either side.)
function weakestOurs() {
  if (MAP.weak?.world === world) return MAP.weak.value
  let min = Infinity
  for (const p of world.players) {
    const sc = world.score?.get(p.id)
    if (p.alliance.toLowerCase() === ALLIES[0].toLowerCase() && sc > 0 && sc < min) min = sc
  }
  MAP.weak = { world, value: min }
  return min
}
function isRelevant(ownerId) {
  if (MAP.all || ownerId === MAP.find || ownerId === MAP.picked) return true
  const side = mapSide(ownerId)
  if (side <= 1) return true
  const o = world.byId.get(ownerId)
  if (!o) return false // not in the daily player list: nobody we know
  if (/[iI]/.test(o.status ?? '')) return false
  if (side === 3) { // no alliance
    const sc = world.score?.get(ownerId)
    if (sc != null && sc < weakestOurs()) return false
  }
  return true
}

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

// which side a planet's owner is on: 0 = us, 1 = the second tab's alliance, 2 = another alliance, 3 = no alliance
function mapSide(ownerId) {
  const tag = (world.byId.get(ownerId)?.alliance ?? '').toLowerCase()
  if (tag && tag === ALLIES[0].toLowerCase()) return 0
  if (tag && tag === slotTag(ALLIES[1]).toLowerCase()) return 1
  return tag ? 2 : 3
}
const SIDE_CLASS = ['m-a0', 'm-a1', 'm-other', 'm-none']
const mapClass = (ownerId) => SIDE_CLASS[mapSide(ownerId)] + (/[iI]/.test(world.byId.get(ownerId)?.status ?? '') ? ' m-idle' : '')

const ang = (s) => ((s - 1) / world.systems) * TAU - Math.PI / 2
const polar = (cx, cy, r, s) => [cx + r * Math.cos(ang(s)), cy + r * Math.sin(ang(s))]
const f1 = (n) => n.toFixed(1)
const f2 = (n) => n.toFixed(2)

// where each galaxy sits in the universe view
function galaxyCentre(g) {
  const a = -Math.PI / 2 + ((g - 1) * TAU) / world.galaxies
  return [200 + 125 * Math.cos(a), 200 + 125 * Math.sin(a)]
}
const UNI_R0 = 30, UNI_R1 = 54 // planet 1 and planet 15 radius of a galaxy in the universe view
const GAL_R0 = 70, GAL_R1 = 188 // the same in the galaxy view
const posRadius = (p, r0, r1) => r0 + ((Math.min(p, 15) - 1) / 14) * (r1 - r0)

// where a coordinate is drawn in the current view, or null if it is not on screen
function mapPoint(g, s, p) {
  if (MAP.galaxy === 0) {
    const [cx, cy] = galaxyCentre(g)
    return polar(cx, cy, posRadius(p, UNI_R0, UNI_R1), s)
  }
  if (g !== MAP.galaxy) return null
  return polar(200, 200, posRadius(p, GAL_R0, GAL_R1), s)
}

// ---- the view: what part of the 400 x 400 map is on screen ----

const svgEl = () => el('map-svg')
// map units per screen pixel: at zoom 1 the whole 400-unit map fits the shorter side of the box
function unitsPerPx() {
  const r = svgEl().getBoundingClientRect()
  return 400 / (Math.min(r.width, r.height) || 400) / MAP.view.k
}
function viewBox() {
  const r = svgEl().getBoundingClientRect()
  const u = unitsPerPx()
  const w = (r.width || 400) * u, h = (r.height || 400) * u
  return { x: MAP.view.cx - w / 2, y: MAP.view.cy - h / 2, w, h, u }
}
function clampView() {
  const v = MAP.view
  v.k = Math.min(MAX_ZOOM, Math.max(1, v.k))
  const slack = 200 - 200 / v.k // how far the centre may move from the middle at this zoom
  v.cx = Math.min(200 + slack, Math.max(200 - slack, v.cx))
  v.cy = Math.min(200 + slack, Math.max(200 - slack, v.cy))
}
// a screen point (clientX/Y) in map units
function toMap(x, y) {
  const r = svgEl().getBoundingClientRect()
  const b = viewBox()
  return [b.x + (x - r.left) * b.u, b.y + (y - r.top) * b.u]
}
// zoom to k, keeping the map point under screen point (x, y) where it is
function zoomAt(k, x, y) {
  const [mx, my] = toMap(x, y)
  const r = svgEl().getBoundingClientRect()
  MAP.view.k = Math.min(MAX_ZOOM, Math.max(1, k))
  const u = unitsPerPx()
  MAP.view.cx = mx - (x - r.left - r.width / 2) * u
  MAP.view.cy = my - (y - r.top - r.height / 2) * u
  clampView()
}
// cheap update while a finger moves: only the view box and the overview frame
function applyView() {
  const b = viewBox()
  svgEl().setAttribute('viewBox', `${f2(b.x)} ${f2(b.y)} ${f2(b.w)} ${f2(b.h)}`)
  const frame = el('map-frame')
  if (frame) {
    frame.setAttribute('x', f1(b.x)); frame.setAttribute('y', f1(b.y))
    frame.setAttribute('width', f1(b.w)); frame.setAttribute('height', f1(b.h))
  }
  el('map-mini').toggleAttribute('hidden', MAP.view.k < 1.3) // an <svg> has no .hidden property, so set the attribute
  el('map-reset').hidden = MAP.view.k < 1.05
  el('map-zoom').textContent = MAP.view.k < 1.05 ? '' : `${MAP.view.k.toFixed(MAP.view.k < 10 ? 1 : 0)}x${whereText(b)}`
}
// "  ·  1:96–104": which systems are in the middle of the screen, so you know where you are when zoomed in
function whereText(b) {
  if (MAP.galaxy === 0) return ''
  const dx = MAP.view.cx - 200, dy = MAP.view.cy - 200, r = Math.hypot(dx, dy)
  if (r < GAL_R0 - 20) return ''
  const S = world.systems
  const wrap = (n) => ((Math.round(n) - 1) % S + S) % S + 1
  const mid = ((Math.atan2(dy, dx) + Math.PI / 2 + TAU) % TAU) / TAU * S + 1
  const half = Math.min(S / 2, (b.w / 2 / (r * TAU)) * S)
  return half >= S / 2 - 1 ? '' : `  ·  ${MAP.galaxy}:${wrap(mid - half)}–${wrap(mid + half)}`
}
let redrawTimer = 0
const redrawSoon = () => { clearTimeout(redrawTimer); redrawTimer = setTimeout(() => drawMap(), 120) }
function resetView() { MAP.view = { cx: 200, cy: 200, k: 1 } }

// ---- moons, gates, phalanx ----

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
  const [r0, r1] = [GAL_R0 - 6, GAL_R1 + 6]
  if (range * 2 + 1 >= world.systems) return `<circle class="m-wedge" cx="200" cy="200" r="${(r0 + r1) / 2}" stroke-width="${r1 - r0}"/>`
  const a0 = ang(s - range) - half, a1 = ang(s + range) + half
  const pt = (r, a) => `${f1(200 + r * Math.cos(a))} ${f1(200 + r * Math.sin(a))}`
  const big = (range * 2 + 1) / world.systems > 0.5 ? 1 : 0
  return `<path class="m-wedge-fill" d="M${pt(r1, a0)} A${r1} ${r1} 0 ${big} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${big} 0 ${pt(r0, a0)} Z"/>`
}

// jump gates: a ring round each gate moon, and a faint line between the gates of one player
function mapGates(px) {
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
    for (const q of pts) if (q) rings += `<circle class="m-gate" cx="${f2(q[0] + px(5))}" cy="${f2(q[1] - px(5))}" r="${f2(px(4.5))}"/>`
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

// arrow heads: sized in map units for the current zoom, so they stay the same size on screen
const mapDefs = (px) => ['alert', 'opportunity', 'info']
  .map((c) => `<marker id="arr-${c}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="${f2(px(9))}" markerHeight="${f2(px(9))}" orient="auto-start-reverse"><path class="m-head ${c}" d="M0 0 L10 5 L0 10 z"/></marker>`).join('')

// ---- drawing ----

// Names next to planets once zoomed in. Drawn on their own layer in screen pixels (not inside the zoomed map), because
// browsers enforce a minimum font size: tiny text inside a scaled-up map gets bumped up first and then magnified with the map.
// Most important first (found player, picked player, us, them, others); a name is skipped if its spot on screen is taken.
function mapLabels(items, b) {
  const k = MAP.view.k
  if (k < 3.5) return ''
  const rank = (x) => (x.owner === MAP.find ? 0 : x.owner === MAP.picked ? 1 : [2, 3, 5, 6][mapSide(x.owner)])
  const allow = k >= 8 ? 6 : k >= 5 ? 3 : 2 // 3.5x: us and the picked player; 5x: them too; 8x: everyone
  const W = b.w / b.u, H = b.h / b.u
  // places a name must not cover: the buttons (top right), the zoom text (top left) and the overview (bottom left)
  const placed = [[W - 60, 0, W, 240], [0, 0, 190, 24], [0, H - 110, 110, H]]
  const free = (r) => placed.every((q) => r[2] < q[0] || r[0] > q[2] || r[3] < q[1] || r[1] > q[3])
  let out = '', n = 0
  const sorted = items.filter((x) => rank(x) <= allow).sort((a, z) => rank(a) - rank(z))
  for (const x of sorted) {
    if (n >= 45) break // more than this is noise on a phone screen
    if (!world.byId.has(x.owner)) continue // owner not in the daily player list yet
    const sx = (x.x - b.x) / b.u + 8, sy = (x.y - b.y) / b.u + 4
    const name = world.byId.get(x.owner).name
    const label = name.length > 12 ? name.slice(0, 11) + '…' : name
    const r = [sx - 2, sy - 13, sx + label.length * 7.2 + 2, sy + 4] // rough box of the text at 11-12px
    if (r[0] < 0 || r[1] < 0 || r[2] > W || r[3] > H || !free(r)) continue
    placed.push(r)
    n++
    out += `<text class="m-label ${SIDE_CLASS[mapSide(x.owner)]}" x="${f1(sx)}" y="${f1(sy)}">${esc(label)}</text>`
  }
  return out
}

function drawMap() {
  if (!world) return (svgEl().innerHTML = '')
  clampView()
  const k = MAP.view.k
  const b = viewBox()
  const u = b.u
  const px = (n) => n * u // screen pixels -> map units at this zoom
  // only draw what is on screen, plus a screen's worth all round (so a drag does not show empty space before the redraw)
  const near = (x, y) => k < 2 || (x > b.x - b.w && x < b.x + 2 * b.w && y > b.y - b.h && y < b.y + 2 * b.h)
  const dotPx = (base) => base * Math.pow(k, 0.45) // dots grow on screen a little as you zoom, so they stay tappable
  const all = mapPlanets()
  const list = all.filter((x) => isRelevant(x.owner))
  MAP.hidden = all.length - list.length
  let body = '', text = '' // text: drawn on the screen-pixel layer
  const shown = [] // planets drawn, with their position, for the names
  if (MAP.galaxy === 0) {
    for (let g = 1; g <= world.galaxies; g++) {
      const [cx, cy] = galaxyCentre(g)
      body += `<g class="m-gal" data-g="${g}"><circle class="m-ring" cx="${f1(cx)}" cy="${f1(cy)}" r="${UNI_R1 + 4}"/><circle class="m-hit" cx="${f1(cx)}" cy="${f1(cy)}" r="${UNI_R1 + 8}"/><text class="m-glabel" x="${f1(cx)}" y="${f1(cy + 4)}">${g}</text></g>`
    }
    const r = f2(px(dotPx(1.2)))
    for (const x of list) {
      const [qx, qy] = mapPoint(x.g, x.s, x.p)
      if (!near(qx, qy)) continue
      body += `<circle class="m-dot ${mapClass(x.owner)}${x.owner === MAP.find ? ' m-on' : ''}" cx="${f1(qx)}" cy="${f1(qy)}" r="${r}"/>`
    }
  } else {
    // rings for planet 1 and 15, faint ones for each planet number in between once zoomed in
    body += `<circle class="m-ring" cx="200" cy="200" r="${GAL_R0 - 6}"/><circle class="m-ring" cx="200" cy="200" r="${GAL_R1 + 6}"/>`
    if (k >= 2.5) for (let p = 1; p <= 15; p++) body += `<circle class="m-ring m-faint" cx="200" cy="200" r="${f1(posRadius(p, GAL_R0, GAL_R1))}"/>`
    body += `<text class="m-glabel big" x="200" y="214">${MAP.galaxy}</text>`
    // system numbers on the inside and outside edge: every 50, then every 10 and every system as you zoom in
    const step = k >= 9 ? 1 : k >= 4 ? 5 : k >= 2 ? 10 : 50
    const every = k >= 9 ? 5 : k >= 4 ? 10 : k >= 2 ? 50 : 50
    for (let s = step; s <= world.systems; s += step) {
      const major = s % every === 0
      const [ox, oy] = polar(200, 200, GAL_R1 + 6, s)
      if (!near(ox, oy) && !near(...polar(200, 200, GAL_R0 - 6, s))) continue
      for (const [r0, dir] of [[GAL_R0 - 6, -1], [GAL_R1 + 6, 1]]) {
        const [x1, y1] = polar(200, 200, r0, s), [x2, y2] = polar(200, 200, r0 + dir * px(major ? 6 : 3), s)
        body += `<line class="m-tick" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`
        if (major) {
          const [tx, ty] = polar(200, 200, r0 + dir * px(14), s)
          text += `<text class="m-num" x="${f1((tx - b.x) / u)}" y="${f1((ty - b.y) / u + 3)}">${s}</text>`
        }
      }
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
    const r = px(dotPx(2.2)), hit = Math.max(r * 1.8, px(13)), mr = px(dotPx(1.2)), mo = px(dotPx(3.2))
    for (const x of here) {
      const [qx, qy] = mapPoint(x.g, x.s, x.p)
      if (!near(qx, qy)) continue
      shown.push({ ...x, x: qx, y: qy })
      const on = x.owner === MAP.picked || x.owner === MAP.find ? ' m-on' : ''
      const selected = x.coords === MAP.selected ? `<circle class="m-sel" cx="${f2(qx)}" cy="${f2(qy)}" r="${f2(r + px(5))}"/>` : ''
      body += `<g class="m-planet" data-c="${x.coords}">${selected}<circle class="m-hit" cx="${f2(qx)}" cy="${f2(qy)}" r="${f2(hit)}"/><circle class="m-dot ${mapClass(x.owner)}${on}" cx="${f2(qx)}" cy="${f2(qy)}" r="${f2(r)}"/>`
      if (x.moon) body += `<circle class="m-moon" cx="${f2(qx + mo)}" cy="${f2(qy - mo)}" r="${f2(mr)}"/>`
      body += '</g>'
    }
  }
  svgEl().innerHTML = `<defs>${mapDefs(px)}</defs>${body}${mapGates(px)}${mapArrows()}`
  const t = el('map-text')
  t.setAttribute('viewBox', `0 0 ${f1(b.w / u)} ${f1(b.h / u)}`)
  t.innerHTML = text + mapLabels(shown, b)
  t.style.visibility = ''
  drawMini()
  applyView()
}

// the overview in the corner: the whole map, small, with a frame round the part on screen. Built once per galaxy and side choice.
function drawMini() {
  const key = `${MAP.galaxy}|${slotTag(ALLIES[1])}|${MAP.pl?.list.length}`
  if (MAP.miniKey !== key) {
    MAP.miniKey = key
    let dots = ''
    if (MAP.galaxy === 0) for (let g = 1; g <= world.galaxies; g++) { const [cx, cy] = galaxyCentre(g); dots += `<circle class="m-ring" cx="${f1(cx)}" cy="${f1(cy)}" r="${UNI_R1 + 4}"/>` }
    else dots += `<circle class="m-ring" cx="200" cy="200" r="${GAL_R0 - 6}"/><circle class="m-ring" cx="200" cy="200" r="${GAL_R1 + 6}"/>`
    for (const x of mapPlanets()) {
      const side = mapSide(x.owner)
      if (side > 1) continue // just us and them: the overview is for finding your way
      const q = mapPoint(x.g, x.s, x.p)
      if (q) dots += `<circle class="${SIDE_CLASS[side]}" cx="${f1(q[0])}" cy="${f1(q[1])}" r="5"/>`
    }
    el('map-mini').innerHTML = `${dots}<rect id="map-frame" class="m-frame"/>`
  }
}

function renderMap(keepInfo) {
  if (!world) return (svgEl().innerHTML = '')
  drawMap()
  el('map-tabs').innerHTML = [0, ...Array.from({ length: world.galaxies }, (_, i) => i + 1)]
    .map((g) => `<button data-g="${g}" class="${g === MAP.galaxy ? 'active' : ''}">${g === 0 ? 'All' : g}</button>`).join('')
  el('map-legend').innerHTML = `<span class="m-a0">&#9679;</span> ${esc(ALLIES[0])} <span class="m-a1">&#9679;</span> ${esc(slotTag(ALLIES[1]))} <span class="m-other">&#9679;</span> others <span class="m-moon-key">&#9679;</span> moon <span class="m-gate-key">&#9675;</span> jump gate`
  el('map-filter').textContent = MAP.all ? 'Hide the players we do not care about' : `Showing what matters (${MAP.hidden ?? 0} planets hidden). Show everyone`
  el('map-hint').textContent = MAP.galaxy === 0 ? 'Tap a galaxy to open it. Pinch or double-tap to zoom. Arrows are flights with a known launch planet.'
    : 'Pinch or double-tap to zoom, drag to move. Planet 1 is the inner edge, planet 15 the outer. Tap a planet.'
  if (!el('map-find-list').children.length) el('map-find-list').innerHTML = world.players.map((p) => `<option value="${esc(p.name)}">`).join('')
  if (!keepInfo) showPicked()
}

function openGalaxy(g) {
  MAP.galaxy = g
  MAP.selected = null
  MAP.picked = null
  resetView()
  renderMap()
}

// ---- touch, mouse and buttons ----

const touch = { pts: new Map(), start: null, moved: false, downAt: 0, target: null, lastTap: 0, lastTapAt: null }

function gestureStart() {
  const p = [...touch.pts.values()]
  if (p.length === 1) touch.start = { x: p[0].x, y: p[0].y, cx: MAP.view.cx, cy: MAP.view.cy }
  else {
    const [a, c] = p
    const mid = [(a.x + c.x) / 2, (a.y + c.y) / 2]
    touch.start = { dist: Math.hypot(a.x - c.x, a.y - c.y) || 1, k: MAP.view.k, at: toMap(...mid) }
  }
}

svgEl().addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  svgEl().setPointerCapture(e.pointerId)
  touch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (touch.pts.size === 1) { touch.moved = false; touch.downAt = Date.now(); touch.target = e.target }
  else touch.moved = true // a second finger: this is a pinch, not a tap
  gestureStart()
})
svgEl().addEventListener('pointermove', (e) => {
  if (!touch.pts.has(e.pointerId)) return
  touch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
  const p = [...touch.pts.values()]
  const s = touch.start
  if (p.length === 1) {
    const dx = p[0].x - s.x, dy = p[0].y - s.y
    if (!touch.moved && Math.hypot(dx, dy) < 8) return // a small wobble is still a tap
    touch.moved = true
    const u = unitsPerPx()
    MAP.view.cx = s.cx - dx * u
    MAP.view.cy = s.cy - dy * u
  } else {
    const [a, c] = p
    const mid = [(a.x + c.x) / 2, (a.y + c.y) / 2]
    MAP.view.k = Math.min(MAX_ZOOM, Math.max(1, (s.k * Math.hypot(a.x - c.x, a.y - c.y)) / s.dist))
    // keep the map point that was under the fingers under the fingers
    const r = svgEl().getBoundingClientRect()
    const u = unitsPerPx()
    MAP.view.cx = s.at[0] - (mid[0] - r.left - r.width / 2) * u
    MAP.view.cy = s.at[1] - (mid[1] - r.top - r.height / 2) * u
  }
  clampView()
  el('map-text').style.visibility = 'hidden' // names would be in the wrong place until the redraw
  requestAnimationFrame(applyView)
})
function pointerEnd(e) {
  if (!touch.pts.has(e.pointerId)) return
  const last = touch.pts.get(e.pointerId)
  touch.pts.delete(e.pointerId)
  if (touch.pts.size) return gestureStart() // one finger left after a pinch: carry on dragging from here
  if (touch.moved) return drawMap()
  if (e.type === 'pointercancel') return
  // a tap. Two quick taps close together zoom in there.
  const now = Date.now()
  if (now - touch.lastTap < 320 && touch.lastTapAt && Math.hypot(last.x - touch.lastTapAt.x, last.y - touch.lastTapAt.y) < 30) {
    touch.lastTap = 0
    zoomAt(MAP.view.k * 2.5, last.x, last.y)
    return drawMap()
  }
  touch.lastTap = now
  touch.lastTapAt = last
  mapTap(touch.target)
}
svgEl().addEventListener('pointerup', pointerEnd)
svgEl().addEventListener('pointercancel', pointerEnd)
svgEl().addEventListener('wheel', (e) => {
  e.preventDefault()
  zoomAt(MAP.view.k * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY)
  el('map-text').style.visibility = 'hidden'
  applyView()
  redrawSoon()
}, { passive: false })

function mapTap(target) {
  const gal = target?.closest?.('.m-gal')
  if (gal) return openGalaxy(Number(gal.dataset.g))
  const pl = target?.closest?.('.m-planet')
  if (!pl) return
  MAP.selected = pl.dataset.c
  MAP.preview = null
  MAP.picked = world.at.get(MAP.selected) ?? null
  renderMap()
}

// zoom buttons zoom round the middle of the screen
function zoomBy(f) {
  const r = svgEl().getBoundingClientRect()
  zoomAt(MAP.view.k * f, r.left + r.width / 2, r.top + r.height / 2)
  drawMap()
}
el('map-in').onclick = () => zoomBy(2)
el('map-out').onclick = () => zoomBy(0.5)
el('map-reset').onclick = () => { resetView(); drawMap() }
// leave full screen (used before jumping to a player page, which a full-screen map would cover)
function closeFullMap() {
  if (el('map').classList.contains('full')) el('map-full').click()
}
el('map-full').onclick = () => {
  const on = el('map').classList.toggle('full')
  el('map-full').innerHTML = on ? '&#x2715;' : '&#x26F6;'
  el('map-full').setAttribute('aria-label', on ? 'Close full screen' : 'Full screen')
  document.body.classList.toggle('noscroll', on)
  drawMap() // the box changed size
}
// tap the overview to jump there
el('map-mini').onclick = (e) => {
  const r = el('map-mini').getBoundingClientRect()
  MAP.view.cx = ((e.clientX - r.left) / r.width) * 400
  MAP.view.cy = ((e.clientY - r.top) / r.height) * 400
  drawMap()
}
addEventListener('resize', () => !el('map').hidden && drawMap())

// "Find": a player name or coordinates. Opens the right galaxy and zooms to fit.
el('map-find').onchange = () => {
  const q = el('map-find').value.trim()
  if (!q || !world) return
  const c = q.match(/^\[?([1-7])\s*[:.\s]\s*(\d{1,3})\s*[:.\s]\s*(\d{1,2})\]?$/)
  if (c) {
    const coords = `${Number(c[1])}:${Number(c[2])}:${Number(c[3])}`
    MAP.galaxy = Number(c[1])
    MAP.selected = world.at.has(coords) ? coords : null
    MAP.picked = world.at.get(coords) ?? null
    MAP.find = null
    const [x, y] = mapPoint(Number(c[1]), Number(c[2]), Number(c[3]))
    MAP.view = { cx: x, cy: y, k: 8 }
    return renderMap()
  }
  const p = world.players.find((x) => x.name.toLowerCase() === q.toLowerCase())
  if (!p) return (el('map-hint').textContent = `No player called "${q}".`)
  const planets = mapPlanets().filter((x) => x.owner === p.id)
  if (!planets.length) return (el('map-hint').textContent = `${p.name} has no planets in the universe data.`)
  // the galaxy where they have the most planets
  const count = {}
  for (const x of planets) count[x.g] = (count[x.g] ?? 0) + 1
  MAP.galaxy = Number(Object.entries(count).sort((a, b) => b[1] - a[1])[0][0])
  MAP.find = p.id
  MAP.picked = p.id
  MAP.selected = null
  const pts = planets.filter((x) => x.g === MAP.galaxy).map((x) => mapPoint(x.g, x.s, x.p))
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 30) + 40
  MAP.view = { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, k: 400 / span }
  renderMap()
  el('map-hint').textContent = `${p.name}: ${planets.length} planet${planets.length === 1 ? '' : 's'}, ${count[MAP.galaxy]} in galaxy ${MAP.galaxy}${Object.keys(count).length > 1 ? ` (also in ${Object.keys(count).filter((g) => Number(g) !== MAP.galaxy).join(', ')})` : ''}.`
}

// ---- the panel under the map ----

// details for the tapped planet
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
    <p class="hint">${o ? playerLink(o.id, o.name) : '?'}${o?.alliance ? ` (${esc(o.alliance)})` : ''} · ${world.byPlayer.get(sel)?.length ?? 0} planets</p>
    ${pl?.moon ? `
      <div class="moon-form">
        <label class="check"><input type="checkbox" id="moon-gate" ${known?.gate ? 'checked' : ''}> Has a jump gate</label>
        <label>Phalanx level <input id="moon-phalanx" type="number" inputmode="numeric" min="0" max="40" value="${known?.phalanx ?? ''}" placeholder="unknown"></label>
        <button type="button" id="moon-save">Save moon</button>
      </div>
      <p id="map-msg" class="msg"></p>
      <div id="moon-report">${moonReport(MAP.selected, level)}</div>` : '<p id="map-msg" class="msg"></p>'}
    </div>`
}

const moonReport = (coords, level) => (level != null ? phalanxReport(coords, level) : '<p class="hint">Enter a phalanx level to see what it can scan.</p>')

// what a phalanx at these coordinates can scan: planets only, same galaxy, within level^2 - 1 systems
function phalanxReport(coords, level) {
  const [g, s] = coords.split(':').map(Number)
  const range = phalanxRange(level)
  const hit = mapPlanets().filter((x) => x.g === g && x.owner !== world.at.get(coords) && sysDistance(x.s, s) <= range)
  const them = hit.filter((x) => mapSide(x.owner) === 1)
  const ours = hit.filter((x) => mapSide(x.owner) === 0)
  const list = them.slice(0, 15).map((x) => `<div class="planet-row">${coordChip(x.g, x.s, x.p)} <span>${esc(x.name)} (${playerLink(x.owner, world.byId.get(x.owner)?.name ?? '?')})</span></div>`).join('')
  return `<p class="hint">Level ${level}: sees ${range} system${range === 1 ? '' : 's'} each way. ${hit.length} planet${hit.length === 1 ? '' : 's'} in range: ${ours.length} ${esc(ALLIES[0])}, ${them.length} ${esc(slotTag(ALLIES[1]))}, ${hit.length - ours.length - them.length} others.</p>${list}${them.length > 15 ? `<p class="hint">...and ${them.length - 15} more.</p>` : ''}`
}

el('map-filter').onclick = () => { MAP.all = !MAP.all; renderMap() }
el('map-tabs').onclick = (e) => {
  const b = e.target.closest('button')
  if (b) openGalaxy(Number(b.dataset.g))
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
}
// typing a level shows its reach straight away, before it is saved
el('map-info').oninput = (e) => {
  if (e.target.id !== 'moon-phalanx') return
  const v = e.target.value
  MAP.preview = v !== '' && Number.isInteger(Number(v)) && v >= 0 && v <= 40 ? Number(v) : null
  drawMap() // redraw the map only, so the box being typed in is left alone
  el('moon-report').innerHTML = moonReport(MAP.selected, MAP.preview ?? MAP.moons.get(MAP.selected)?.phalanx)
}

async function openMap() {
  el('map-hint').textContent = 'Loading universe data...'
  await loadCalc()
  await Promise.all([typeof loadLandings === 'function' ? loadLandings() : 0, loadMoons()]) // arrows, gates and phalanx levels
  renderMap()
}
