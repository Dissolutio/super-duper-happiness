// ---- config: alliance tags to track (case-insensitive). First = us, second = enemy. ----
const ALLIES = ['DONUT', 'PMA']
// players.xml status letters
const STATUS = { v: 'vacation', i: 'inactive', I: 'long inactive', b: 'banned', o: 'outlaw', a: 'admin' }

// ---- helpers ----
const $ = (sel, root = document) => Array.from(root.querySelectorAll(sel))
const el = (id) => document.getElementById(id)
const num = (n) => Math.round(Number(n)).toLocaleString()
// everything that came from the API goes through esc() before touching innerHTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

async function getXml(path) {
  const r = await fetch('/api/' + path)
  if (!r.ok) throw new Error(path + ' -> ' + r.status)
  return new DOMParser().parseFromString(await r.text(), 'text/xml')
}

// highscore.xml -> { byId: { id: { position, score, ships } }, time: Date }
function parseHighscore(doc, tagName = 'player') {
  const byId = {}
  $(tagName, doc).forEach((p) => {
    byId[p.getAttribute('id')] = {
      position: Number(p.getAttribute('position')),
      score: Number(p.getAttribute('score')),
      ships: Number(p.getAttribute('ships') || 0),
    }
  })
  return { byId, time: new Date(doc.documentElement.getAttribute('timestamp') * 1000) }
}

// ---- load everything the API has that we care about ----
async function load() {
  const [players, alliances, total, eco, res, mil, allyHs] = await Promise.all([
    getXml('players.xml'),
    getXml('alliances.xml'),
    getXml('highscore.xml?category=1&type=0'), // player total
    getXml('highscore.xml?category=1&type=1'), // economy
    getXml('highscore.xml?category=1&type=2'), // research
    getXml('highscore.xml?category=1&type=3'), // military (has ships count)
    getXml('highscore.xml?category=2&type=0'), // alliance total
  ])

  const playerInfo = {} // id -> { name, status }
  $('player', players).forEach((p) => {
    playerInfo[p.getAttribute('id')] = { name: p.getAttribute('name'), status: p.getAttribute('status') || '' }
  })

  const hs = { total: parseHighscore(total), eco: parseHighscore(eco), res: parseHighscore(res), mil: parseHighscore(mil) }
  const allyRanks = parseHighscore(allyHs, 'alliance')

  const allies = ALLIES.map((tag) => {
    const a = $('alliance', alliances).find((x) => x.getAttribute('tag').toLowerCase() === tag.toLowerCase())
    if (!a) return { tag, members: [] }
    const members = $('player', a).map((p) => {
      const id = p.getAttribute('id')
      return {
        id,
        name: playerInfo[id]?.name ?? '?',
        status: playerInfo[id]?.status ?? '',
        rank: hs.total.byId[id]?.position ?? 99999,
        points: hs.total.byId[id]?.score ?? 0,
        eco: hs.eco.byId[id]?.score ?? 0,
        res: hs.res.byId[id]?.score ?? 0,
        milPoints: hs.mil.byId[id]?.score ?? 0,
        ships: hs.mil.byId[id]?.ships ?? 0,
      }
    })
    return { tag, name: a.getAttribute('name'), rank: allyRanks.byId[a.getAttribute('id')]?.position, members }
  })

  return { allies, scoresAt: hs.total.time, alliancesAt: new Date(alliances.documentElement.getAttribute('timestamp') * 1000) }
}

// ---- render ----
const sum = (a, key) => a.members.reduce((s, m) => s + m[key], 0)
const count = (a, letter) => a.members.filter((m) => m.status.includes(letter)).length
const inactive = (a) => a.members.filter((m) => /i/i.test(m.status)).length

// [label, value fn, best: 'high' | 'low' | null (don't highlight)]
const SUMMARY_ROWS = [
  ['Alliance rank', (a) => a.rank ?? null, 'low'],
  ['Members', (a) => a.members.length, 'high'],
  ['Points', (a) => sum(a, 'points'), 'high'],
  ['Economy', (a) => sum(a, 'eco'), 'high'],
  ['Research', (a) => sum(a, 'res'), 'high'],
  ['Military', (a) => sum(a, 'milPoints'), 'high'],
  ['Ships', (a) => sum(a, 'ships'), 'high'],
  ['Avg points', (a) => (a.members.length ? Math.round(sum(a, 'points') / a.members.length) : 0), 'high'],
  ['Inactive', inactive, null],
  ['Vacation', (a) => count(a, 'v'), null],
]

function renderSummary(allies) {
  const head = allies.map((a, i) => `<th class="c${i}">${esc(a.tag)}</th>`).join('')
  const rows = SUMMARY_ROWS.map(([label, fn, best]) => {
    const vals = allies.map((a) => (a.members.length ? fn(a) : null))
    const known = vals.filter((v) => v !== null)
    const target = best === 'high' ? Math.max(...known) : best === 'low' ? Math.min(...known) : null
    const cells = vals.map((v) => `<td class="${v !== null && v === target && known.length > 1 ? 'win' : ''}">${v === null ? '–' : (label === 'Alliance rank' ? '#' : '') + num(v)}</td>`).join('')
    return `<tr><th>${label}</th>${cells}</tr>`
  }).join('')
  el('summary').innerHTML = `<table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`
}

function renderTabs() {
  el('tabs').innerHTML = state.data.allies
    .map((a, i) => `<button data-i="${i}" class="c${i} ${i === state.active ? 'active' : ''}">${esc(a.tag)}</button>`).join('')
}

function renderPlayers() {
  const a = state.data.allies[state.active]
  if (!a.members.length) return (el('players').innerHTML = `<p class="empty">Alliance "${esc(a.tag)}" not found.</p>`)
  const key = state.sort
  const sorted = [...a.members].sort((x, y) => (key === 'rank' ? x.rank - y.rank : y[key] - x[key]))
  el('players').innerHTML = sorted.map((m) => {
    const badges = [...m.status].map((s) => `<span class="badge">${esc(STATUS[s] ?? s)}</span>`).join('')
    return `
      <div class="card c${state.active}">
        <div class="top"><span class="name">${esc(m.name)}${badges}</span><span class="rank">#${m.rank === 99999 ? '–' : num(m.rank)}</span></div>
        <dl>
          <div><dt>Points</dt><dd>${num(m.points)}</dd></div>
          <div><dt>Eco</dt><dd>${num(m.eco)}</dd></div>
          <div><dt>Res</dt><dd>${num(m.res)}</dd></div>
          <div><dt>Mil</dt><dd>${num(m.milPoints)}</dd></div>
          <div><dt>Ships</dt><dd>${num(m.ships)}</dd></div>
        </dl>
      </div>`
  }).join('')
}

// ---- wiring ----
const state = { data: null, active: 0, sort: 'rank' }

async function refresh() {
  el('status').textContent = 'loading...'
  try {
    state.data = await load()
    renderSummary(state.data.allies)
    renderTabs()
    renderPlayers()
    el('status').textContent = `Scores as of ${state.data.scoresAt.toLocaleString()} · members as of ${state.data.alliancesAt.toLocaleString()}`
  } catch (e) {
    el('status').textContent = 'error: ' + e.message
  }
}

el('refresh').onclick = refresh
el('sort').onchange = (e) => { state.sort = e.target.value; renderPlayers() }
el('tabs').onclick = (e) => {
  const b = e.target.closest('button')
  if (!b) return
  state.active = Number(b.dataset.i)
  renderTabs()
  renderPlayers()
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
refresh()
