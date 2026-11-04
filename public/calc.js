// Flight calculator on the Players screen. Needs flight.js, app.js (el, esc) and intel.js (intelRows).
// Settings are remembered in this browser only (localStorage), a convenience and nothing shared.

const FC_KEY = 'fc-settings'
const FC_FIELDS = ['from', 'to', 'ship', 'mission', 'pct', 'who', 'comb', 'imp', 'hyper', 'lf']
let world = null
let fcLast = 'to' // which coordinate box a tapped planet fills

el('fc-ship').innerHTML = SHIPS.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
el('fc-ship').value = 209
el('fc-pct').innerHTML = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((n) => `<option value="${n}">${n}%</option>`).join('')

function fcRestore() {
  try {
    const saved = JSON.parse(localStorage.getItem(FC_KEY)) ?? {}
    for (const f of FC_FIELDS) if (saved[f] != null && el('fc-' + f)) el('fc-' + f).value = saved[f]
  } catch { /* nothing saved yet */ }
}
function fcSave() {
  try { localStorage.setItem(FC_KEY, JSON.stringify(Object.fromEntries(FC_FIELDS.map((f) => [f, el('fc-' + f).value])))) } catch { /* storage blocked: fine */ }
}

async function loadCalc() {
  if (world) return
  el('fc-result').textContent = 'Loading universe data...'
  try {
    world = await loadWorld()
    el('fc-names').innerHTML = world.players.map((p) => `<option value="${esc(p.name)}">`).join('')
  } catch (e) {
    return (el('fc-result').textContent = 'Could not load the universe data: ' + e.message)
  }
  recalc()
  if (typeof renderRoster === 'function') renderRoster() // alliance lists need the universe data
  if (typeof landings !== 'undefined' && landings.length) renderLandings() // planet owners on the landings
}

// the "whose tech" menu lists everyone we have a spy report on; called by intel.js whenever the list reloads
function fillTechChoices() {
  const keep = el('fc-who').value
  el('fc-who').innerHTML = '<option value="">Typed in below</option>' +
    intelRows.filter((r) => r.tech_at).map((r) => `<option value="${esc(r.player_id)}">${esc(r.name)}</option>`).join('')
  el('fc-who').value = keep
  if (el('fc-who').value !== keep) el('fc-who').value = ''
  useChosenTech()
}

// copy the chosen player's drives and (for the chosen ship) lifeform speed into the boxes
function useChosenTech() {
  const row = intelRows.find((r) => String(r.player_id) === el('fc-who').value)
  if (!row) return
  const t = row.tech ?? {}
  el('fc-comb').value = t[115] ?? ''
  el('fc-imp').value = t[117] ?? ''
  el('fc-hyper').value = t[118] ?? ''
  el('fc-lf').value = row.speed_bonus?.[el('fc-ship').value] ?? ''
}

const fmtTime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s` : `${m}m ${String(sec).padStart(2, '0')}s`
}

// what the boxes currently say
function calcInputs() {
  const num = (id) => Math.max(0, Number(el(id).value) || 0)
  return {
    ship: SHIPS.find((s) => s.id === Number(el('fc-ship').value)),
    tech: { comb: num('fc-comb'), imp: num('fc-imp'), hyper: num('fc-hyper') },
    lf: Number(el('fc-lf').value) || 0, mission: el('fc-mission').value, pct: Number(el('fc-pct').value),
  }
}

// used by the player page: flight time from the calculator's From box to some coordinates, or null if it can't be worked out
function calcFlightTo(coords) {
  const from = parseCoords(el('fc-from').value), to = parseCoords(coords)
  if (!world || !from || !to) return null
  const { ship, tech, lf, mission, pct } = calcInputs()
  return flightSeconds(world, from, to, ship, tech, lf, mission, pct).seconds
}
function calcSummary() {
  const { ship, mission, pct } = calcInputs()
  return `from ${el('fc-from').value.trim()} by ${ship.name}, ${mission}, ${pct}%`
}

function recalc() {
  fcSave()
  const out = el('fc-result')
  if (!world) return
  const from = parseCoords(el('fc-from').value), to = parseCoords(el('fc-to').value)
  if (!from || !to) return (out.textContent = 'Enter both coordinates, like 1:98:5.')
  const ok = (c) => c.g >= 1 && c.g <= world.galaxies && c.s >= 1 && c.s <= world.systems && c.p >= 1 && c.p <= 15
  if (!ok(from) || !ok(to)) return (out.textContent = `Coordinates look wrong (galaxy 1-${world.galaxies}, system 1-${world.systems}, planet 1-15).`)
  const { ship, tech, lf, mission, pct } = calcInputs()
  const r = flightSeconds(world, from, to, ship, tech, lf, mission, pct)
  const at = new Date(Date.now() + r.seconds * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  out.innerHTML = `<b>${fmtTime(r.seconds)}</b> &middot; arrives ${esc(at)}<br>
    <span class="hint">distance ${r.distance.toLocaleString()} &middot; ${esc(ship.name)} speed ${Math.round(r.shipSpeed).toLocaleString()}.
    Universe data is up to a week old, so a route can be off near a changed system.</span>`
}

// list a player's planets as tappable chips
function showPlanets() {
  const name = el('fc-player').value.trim().toLowerCase()
  const p = world?.players.find((x) => x.name.toLowerCase() === name)
  if (!p) return (el('fc-planets').innerHTML = '')
  const list = world.byPlayer.get(p.id) ?? []
  el('fc-planets').innerHTML = list.length
    ? list.map((x) => `<button type="button" class="chip" data-c="${esc(x.coords)}">[${esc(x.coords)}]${x.moon ? ' &#9790;' : ''} ${esc(x.name)}</button>`).join('')
    : '<span class="hint">No planets known for that player.</span>'
}

el('fc-planets').onclick = (e) => {
  const b = e.target.closest('button[data-c]')
  if (!b) return
  el('fc-' + fcLast).value = b.dataset.c
  recalc()
}
el('fc-from').onfocus = () => (fcLast = 'from')
el('fc-to').onfocus = () => (fcLast = 'to')
el('fc-player').oninput = showPlanets
el('fc-who').onchange = () => { useChosenTech(); recalc() }
el('fc-ship').onchange = () => { useChosenTech(); recalc() }
for (const f of FC_FIELDS) if (!['who', 'ship'].includes(f)) el('fc-' + f).oninput = recalc

fcRestore()
