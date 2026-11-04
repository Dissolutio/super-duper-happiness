// Landings: fleets arriving somewhere, pinned at the top of the Targets channel.
// Arrival is stored as one absolute moment; each person sees it in their own timezone plus a live countdown.
// Needs auth.js (sb, getToken), app.js (el, esc), chat.js (coordChip) and gate.js (me, logout).
const SHOW_LANDED_MIN = 30 // keep a landing on screen this long after it arrives
const SIDE = { ours: 'Our attack', theirs: 'Enemy incoming', move: 'Fleet move' }

let landings = []

async function loadLandings() {
  const since = new Date(Date.now() - SHOW_LANDED_MIN * 60000).toISOString()
  try {
    landings = await sb(`/rest/v1/landings?select=id,side,galaxy,system,position,strength,arrives_at,author,profiles(display_name)&arrives_at=gt.${since}&order=arrives_at.asc`, { token: await getToken() })
    renderLandings()
  } catch (e) {
    if (e.status === 401) return logout()
    el('chat-msg').textContent = e.message
  }
}

// "2h 15m 03s", "12m 09s", "1d 3h"
function countdown(ms) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

// "UncleDaddy" or "Dethmachien (DONUT)": who lives at these coordinates, once the universe data has loaded
function ownerNote(coords) {
  const o = world && ownerAt(world, coords)
  return o ? `<span class="l-owner">${esc(o.name)}${o.alliance ? ` (${esc(o.alliance)})` : ''}</span>` : ''
}

// an "attack" on a planet of our own alliance is really a move (also fixes ones entered before moves existed)
function sideOf(l) {
  const o = l.side === 'ours' && world && ownerAt(world, `${l.galaxy}:${l.system}:${l.position}`)
  return o && o.alliance && o.alliance.toLowerCase() === ALLIES[0].toLowerCase() ? 'move' : l.side
}

function renderLandings() {
  if (!landings.length) return (el('landings').innerHTML = '<p class="empty">No landings planned.</p>')
  // still-coming ones first (soonest first), recently landed ones after
  const upcoming = (l) => new Date(l.arrives_at) > Date.now()
  const ordered = [...landings].sort((a, b) => upcoming(b) - upcoming(a) || new Date(a.arrives_at) - new Date(b.arrives_at))
  el('landings').innerHTML = ordered.map((l) => {
    const at = new Date(l.arrives_at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    const mine = l.author === me.user.id
    const side = sideOf(l)
    return `
      <div class="landing ${esc(side)} ${upcoming(l) ? '' : 'landed'}">
        <div class="l-top">
          <span class="l-side">${esc(SIDE[side] ?? side)}</span>
          ${coordChip(l.galaxy, l.system, l.position)}
          ${ownerNote(`${l.galaxy}:${l.system}:${l.position}`)}
          <span class="l-strength">${esc(l.strength)}</span>
        </div>
        <div class="l-time"><b class="count" data-t="${esc(l.arrives_at)}"></b> <span>${esc(at)}</span></div>
        <div class="l-who">${esc(l.profiles?.display_name ?? '?')}${mine ? ` <button class="remove" data-id="${l.id}">Remove</button>` : ''}</div>
      </div>`
  }).join('')
  tick()
}

// runs every second: update each countdown from the arrival time
function tick() {
  $('.count').forEach((c) => {
    const ms = new Date(c.dataset.t) - Date.now()
    c.textContent = ms > 1000 ? countdown(ms) : ms > -60000 ? 'landing now' : `landed ${Math.floor(-ms / 60000)}m ago`
  })
}
setInterval(tick, 1000)

el('landings').onclick = async (e) => {
  const b = e.target.closest('button.remove')
  if (!b || !confirm('Remove this landing?')) return
  try {
    await sb('/rest/v1/landings?id=eq.' + encodeURIComponent(b.dataset.id), { method: 'DELETE', token: await getToken() })
    loadLandings()
  } catch (err) {
    el('landing-msg').textContent = err.message
  }
}

// An "attack" on a planet of our own alliance can't be an attack, so it is a fleet move: switch it, and say so.
function suggestMove() {
  const f = el('landing-form').elements
  const hint = el('landing-hint')
  hint.textContent = ''
  const coords = [f.galaxy.value, f.system.value, f.position.value].map(Number).join(':')
  const o = world && ownerAt(world, coords)
  if (!o) return
  const ours = o.alliance && o.alliance.toLowerCase() === ALLIES[0].toLowerCase()
  if (f.side.value === 'ours' && ours) {
    f.side.value = 'move'
    hint.textContent = `That is ${o.name}'s planet (${o.alliance}), so this is a fleet move, not an attack.`
  } else if (f.side.value === 'move' && !ours) {
    hint.textContent = `Careful: that planet belongs to ${o.name}${o.alliance ? ` (${o.alliance})` : ''}, not ${ALLIES[0]}. Is this really a move?`
  } else if (f.side.value === 'move') {
    hint.textContent = `${o.name}'s planet (${o.alliance}).`
  }
}
for (const n of ['galaxy', 'system', 'position']) el('landing-form').elements[n].oninput = suggestMove
el('landing-form').elements.side.onchange = suggestMove

// "Say it all in one go": parse the sentence and fill in the form. The person checks it and taps Add.
el('say-fill').onclick = () => {
  const r = parseLanding(el('say').value)
  const f = el('landing-form').elements
  f.side.value = r.side
  if (r.galaxy) [f.galaxy.value, f.system.value, f.position.value] = [r.galaxy, r.system, r.position]
  if (r.strength) f.strength.value = r.strength
  if (r.hours || r.minutes) [f.hours.value, f.minutes.value] = [r.hours, r.minutes]
  suggestMove()
  const heard = [
    SIDE[f.side.value],
    r.galaxy && `[${r.galaxy}:${r.system}:${r.position}]`,
    r.strength,
    (r.hours || r.minutes) && `lands in ${r.hours}h ${r.minutes}m`,
  ].filter(Boolean).join(', ')
  el('say-result').textContent = r.missing.length === 3
    ? "Couldn't make sense of that. Please fill in the form below."
    : r.missing.length
    ? `Heard: ${heard}. Couldn't find: ${r.missing.join(', ')}. Please fill that in below.`
    : `Heard: ${heard}. Check it below, then tap Add landing.`
}

el('landing-form').onsubmit = async (e) => {
  e.preventDefault()
  const f = e.target.elements
  const [galaxy, system, position] = [f.galaxy.value, f.system.value, f.position.value].map(Number)
  const minutes = Number(f.hours.value || 0) * 60 + Number(f.minutes.value || 0)
  const strength = f.strength.value.trim()
  const msg = (t) => (el('landing-msg').textContent = t)
  if (!(galaxy >= 1 && galaxy <= MAX_GALAXY && system >= 1 && system <= 499 && position >= 1 && position <= 15)) return msg(`Coordinates look wrong (galaxy 1-${MAX_GALAXY}, system 1-499, planet 1-15).`)
  if (!strength) return msg('How big is the fleet? A rough guess is fine.')
  if (!(minutes >= 1 && minutes <= 10080)) return msg('When does it land? Enter hours and/or minutes from now.')
  msg('')
  try {
    await sb('/rest/v1/rpc/add_landing', {
      method: 'POST', token: await getToken(),
      body: { p_side: f.side.value, p_galaxy: galaxy, p_system: system, p_position: position, p_strength: strength, p_minutes: minutes },
    })
    e.target.reset()
    el('say-result').textContent = ''
    el('landing-hint').textContent = ''
    el('landing-add').open = false
    loadLandings()
  } catch (err) {
    if (err.status === 401) return logout()
    msg(err.message)
  }
}
