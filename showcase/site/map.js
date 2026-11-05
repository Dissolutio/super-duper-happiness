// The public alliance map. Standalone: it shares no code with the war room and talks only to /api/*.xml (the game's public files).
// Orange = DONUT, everyone else is faint. Tap a galaxy to open it, pinch / wheel / buttons to zoom, drag to move.
'use strict'
const TAG = 'DONUT'
const TAU = Math.PI * 2, MAX_ZOOM = 12
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const f1 = (n) => n.toFixed(1), f2 = (n) => n.toFixed(2)
const COORDS = /^[1-7]:\d{1,3}:\d{1,2}$/

const W = { galaxies: 7, systems: 499, planets: [], players: new Map(), score: new Map(), us: [] }
const V = { galaxy: 0, cx: 200, cy: 200, k: 1, selected: null, find: null }

async function getXml(name) {
  const r = await fetch('/api/' + name)
  if (!r.ok) throw new Error(name + ' ' + r.status)
  return new DOMParser().parseFromString(await r.text(), 'text/xml')
}

async function load() {
  const [u, p, a, s] = await Promise.all([getXml('universe.xml'), getXml('players.xml'), getXml('alliances.xml'), getXml('serverData.xml')])
  W.galaxies = Number(s.querySelector('galaxies')?.textContent) || 7
  W.systems = Number(s.querySelector('systems')?.textContent) || 499
  const tagOf = new Map([...a.querySelectorAll('alliance')].map((x) => [x.getAttribute('id'), x.getAttribute('tag')]))
  for (const x of p.querySelectorAll('player')) {
    const tag = tagOf.get(x.getAttribute('alliance')) ?? ''
    W.players.set(x.getAttribute('id'), { id: x.getAttribute('id'), name: x.getAttribute('name') ?? '?', tag, us: tag.toLowerCase() === TAG.toLowerCase(), planets: [] })
  }
  for (const x of u.querySelectorAll('planet')) {
    const coords = x.getAttribute('coords') ?? ''
    if (!COORDS.test(coords)) continue
    const [g, sy, po] = coords.split(':').map(Number)
    const owner = W.players.get(x.getAttribute('player'))
    if (!owner) continue
    const pl = { g, s: sy, p: po, coords, name: x.getAttribute('name') ?? '', moon: !!x.querySelector('moon'), owner }
    W.planets.push(pl)
    owner.planets.push(pl)
  }
  W.us = [...W.players.values()].filter((x) => x.us)
  try { // points are nice to have: the page works without them
    for (const x of (await getXml('highscore.xml?category=1&type=0')).querySelectorAll('player')) W.score.set(x.getAttribute('id'), Number(x.getAttribute('score')))
  } catch { /* no points */ }
}

// ---- geometry: galaxies on a ring in the universe view, systems round a ring, planet number = distance from the centre ----
const ang = (s) => ((s - 1) / W.systems) * TAU - Math.PI / 2
const polar = (cx, cy, r, s) => [cx + r * Math.cos(ang(s)), cy + r * Math.sin(ang(s))]
const UNI_R0 = 30, UNI_R1 = 54, GAL_R0 = 70, GAL_R1 = 188
const radius = (p, r0, r1) => r0 + ((Math.min(p, 15) - 1) / 14) * (r1 - r0)
function galaxyCentre(g) { const a = -Math.PI / 2 + ((g - 1) * TAU) / W.galaxies; return [200 + 125 * Math.cos(a), 200 + 125 * Math.sin(a)] }
function point(x) {
  if (V.galaxy === 0) { const [cx, cy] = galaxyCentre(x.g); return polar(cx, cy, radius(x.p, UNI_R0, UNI_R1), x.s) }
  return x.g === V.galaxy ? polar(200, 200, radius(x.p, GAL_R0, GAL_R1), x.s) : null
}

// ---- view ----
const svg = $('svg')
function unitsPerPx() { const r = svg.getBoundingClientRect(); return 400 / (Math.min(r.width, r.height) || 400) / V.k }
function box() {
  const r = svg.getBoundingClientRect(), u = unitsPerPx()
  const w = (r.width || 400) * u, h = (r.height || 400) * u
  return { x: V.cx - w / 2, y: V.cy - h / 2, w, h, u }
}
function clamp() {
  V.k = Math.min(MAX_ZOOM, Math.max(1, V.k))
  const b = box()
  const lim = (half) => Math.max(0, 200 - half)
  V.cx = Math.min(200 + lim(b.w / 2), Math.max(200 - lim(b.w / 2), V.cx))
  V.cy = Math.min(200 + lim(b.h / 2), Math.max(200 - lim(b.h / 2), V.cy))
}
function toMap(x, y) { const r = svg.getBoundingClientRect(), b = box(); return [b.x + (x - r.left) * b.u, b.y + (y - r.top) * b.u] }
function zoomAt(k, x, y) {
  const [mx, my] = toMap(x, y), r = svg.getBoundingClientRect()
  V.k = Math.min(MAX_ZOOM, Math.max(1, k))
  const u = unitsPerPx()
  V.cx = mx - (x - r.left - r.width / 2) * u
  V.cy = my - (y - r.top - r.height / 2) * u
  clamp()
}
function applyView() {
  const b = box()
  svg.setAttribute('viewBox', `${f2(b.x)} ${f2(b.y)} ${f2(b.w)} ${f2(b.h)}`)
  $('zreset').hidden = V.k < 1.05
  $('zoomtxt').textContent = V.k < 1.05 ? '' : `${V.k.toFixed(V.k < 10 ? 1 : 0)}x`
}
let redrawTimer = 0
const redrawSoon = () => { clearTimeout(redrawTimer); redrawTimer = setTimeout(draw, 120) }

// ---- drawing ----
function draw() {
  clamp()
  const k = V.k, b = box(), u = b.u
  const near = (x, y) => k < 2 || (x > b.x - b.w && x < b.x + 2 * b.w && y > b.y - b.h && y < b.y + 2 * b.h)
  const dot = (base) => base * Math.pow(k, 0.45) * u // grows a little as you zoom, so it stays tappable
  let body = '', ours = ''
  if (V.galaxy === 0) {
    for (let g = 1; g <= W.galaxies; g++) {
      const [cx, cy] = galaxyCentre(g)
      body += `<g class="gal" data-g="${g}"><circle class="ring" cx="${f1(cx)}" cy="${f1(cy)}" r="${UNI_R1 + 4}"/><circle class="hit" cx="${f1(cx)}" cy="${f1(cy)}" r="${UNI_R1 + 8}"/><text class="glabel" x="${f1(cx)}" y="${f1(cy + 4)}">${g}</text></g>`
    }
  } else {
    body += `<circle class="ring" cx="200" cy="200" r="${GAL_R0 - 6}"/><circle class="ring" cx="200" cy="200" r="${GAL_R1 + 6}"/>`
    if (k >= 2.5) for (let p = 1; p <= 15; p++) body += `<circle class="ring faint" cx="200" cy="200" r="${f1(radius(p, GAL_R0, GAL_R1))}"/>`
    body += `<text class="glabel big" x="200" y="230">${V.galaxy}</text>`
    const step = k >= 9 ? 1 : k >= 4 ? 5 : k >= 2 ? 10 : 50
    for (let s = step; s <= W.systems; s += step) for (const [r0, dir] of [[GAL_R0 - 6, -1], [GAL_R1 + 6, 1]]) {
      const [x1, y1] = polar(200, 200, r0, s), [x2, y2] = polar(200, 200, r0 + dir * u * (s % (step * 5) === 0 ? 6 : 3), s)
      if (near(x1, y1)) body += `<line class="tick" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`
    }
  }
  const small = V.galaxy === 0 ? 1.2 : 2.2
  for (const x of W.planets) {
    const q = point(x)
    if (!q || !near(q[0], q[1])) continue
    const us = x.owner.us
    const cls = `d${us ? ' us' : ''}${x.coords === V.selected ? ' sel' : ''}${x.owner.id === V.find ? ' us sel' : ''}`
    const r = f2(dot(us ? small * 1.25 : small))
    const el = V.galaxy === 0 ? `<circle class="${cls}" cx="${f1(q[0])}" cy="${f1(q[1])}" r="${r}"/>`
      : `<g data-c="${x.coords}"><circle class="hit" cx="${f2(q[0])}" cy="${f2(q[1])}" r="${f2(Math.max(dot(small) * 1.8, 13 * u))}"/><circle class="${cls}" cx="${f2(q[0])}" cy="${f2(q[1])}" r="${r}"/>${x.moon ? `<circle class="moon" cx="${f2(q[0] + dot(3.2))}" cy="${f2(q[1] - dot(3.2))}" r="${f2(dot(1.2))}"/>` : ''}</g>`
    if (us) ours += el; else body += el // ours on top
  }
  svg.innerHTML = body + ours
  applyView()
}

function tabs() {
  $('tabs').innerHTML = [0, ...Array.from({ length: W.galaxies }, (_, i) => i + 1)].map((g) => `<button type="button" data-g="${g}" class="${g === V.galaxy ? 'active' : ''}">${g === 0 ? 'All' : g}</button>`).join('')
}
function openGalaxy(g) { V.galaxy = g; V.selected = null; V.cx = 200; V.cy = 200; V.k = 1; $('card').hidden = true; tabs(); draw() }
$('tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) openGalaxy(Number(b.dataset.g)) }

// ---- the card for a tapped planet ----
function showCard(coords) {
  const x = W.planets.find((p) => p.coords === coords)
  V.selected = x ? coords : null
  const card = $('card')
  card.hidden = !x
  if (x) {
    const o = x.owner
    card.innerHTML = `<div class="t">${esc(x.name)}${x.moon ? ' &#9790;' : ''} <span class="s">[${esc(coords)}]</span></div><div class="s">${o.us ? `<b class="us">${esc(o.name)}</b>` : esc(o.name)}${o.tag ? ` (${esc(o.tag)})` : ''} &middot; ${o.planets.length} planet${o.planets.length === 1 ? '' : 's'}</div>`
  }
  draw()
}

// ---- touch, mouse and buttons ----
const ptrs = new Map()
let start = null, moved = false
svg.addEventListener('pointerdown', (e) => {
  svg.setPointerCapture(e.pointerId)
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  moved = false
  start = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, cx: V.cx, cy: V.cy } : null
  if (ptrs.size === 2) { const [a, c] = [...ptrs.values()]; start = { d: Math.hypot(a.x - c.x, a.y - c.y), k: V.k } }
})
svg.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (ptrs.size === 2 && start?.d) {
    const [a, c] = [...ptrs.values()]
    zoomAt(start.k * Math.hypot(a.x - c.x, a.y - c.y) / start.d, (a.x + c.x) / 2, (a.y + c.y) / 2)
    moved = true; applyView(); redrawSoon()
  } else if (ptrs.size === 1 && start && !start.d) {
    const dx = e.clientX - start.x, dy = e.clientY - start.y
    if (!moved && Math.hypot(dx, dy) < 6) return
    moved = true
    const u = unitsPerPx()
    V.cx = start.cx - dx * u; V.cy = start.cy - dy * u
    clamp(); applyView(); redrawSoon()
  }
})
const endPtr = (e) => {
  const was = ptrs.size
  ptrs.delete(e.pointerId)
  if (e.type === 'pointerup' && was === 1 && !moved) tap(e.clientX, e.clientY)
  if (ptrs.size === 0) start = null
  else if (ptrs.size === 1) { const [p] = [...ptrs.values()]; start = { x: p.x, y: p.y, cx: V.cx, cy: V.cy }; moved = true }
}
svg.addEventListener('pointerup', endPtr)
svg.addEventListener('pointercancel', endPtr)
svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(V.k * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); applyView(); redrawSoon() }, { passive: false })
function tap(x, y) {
  const t = document.elementFromPoint(x, y)
  const gal = t?.closest?.('.gal'), pl = t?.closest?.('[data-c]')
  if (gal && V.galaxy === 0) return openGalaxy(Number(gal.dataset.g))
  if (pl && COORDS.test(pl.dataset.c)) return showCard(pl.dataset.c)
  if (V.selected) { V.selected = null; $('card').hidden = true; draw() }
}
const zoomBtn = (f) => () => { const r = svg.getBoundingClientRect(); zoomAt(V.k * f, r.left + r.width / 2, r.top + r.height / 2); draw() }
$('zin').onclick = zoomBtn(1.6)
$('zout').onclick = zoomBtn(1 / 1.6)
$('zreset').onclick = () => { V.cx = 200; V.cy = 200; V.k = 1; draw() }
window.addEventListener('resize', () => draw())

// ---- the member list ----
function members() {
  const list = [...W.us].sort((a, z) => (W.score.get(z.id) ?? 0) - (W.score.get(a.id) ?? 0))
  $('list').innerHTML = list.map((m) => `<button type="button" class="row" data-id="${esc(m.id)}"><span>${esc(m.name)}</span><span>${m.planets.length} planet${m.planets.length === 1 ? '' : 's'}${W.score.has(m.id) ? ` &middot; ${Math.round(W.score.get(m.id)).toLocaleString('en-US')} pts` : ''}</span></button>`).join('')
  const total = list.reduce((a, m) => a + m.planets.length, 0)
  $('sub').textContent = `${list.length} members, ${total} planets, universe Jishui (USA)`
}
// tapping a member opens the galaxy of their first planet and rings all their planets
$('list').onclick = (e) => {
  const row = e.target.closest('.row'); if (!row) return
  const m = W.players.get(row.dataset.id)
  if (!m?.planets.length) return
  openGalaxy(m.planets[0].g)
  V.find = m.id; draw()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

load().then(() => { members(); tabs(); draw() }).catch(() => { $('sub').textContent = 'Could not load the game data. Try again in a minute.' })
