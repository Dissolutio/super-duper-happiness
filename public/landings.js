// Landings: fleets arriving somewhere, pinned at the top of the Targets channel.
// Arrival is stored as one absolute moment; each person sees it in their own timezone plus a live countdown.
// Needs auth.js (sb, getToken), app.js (el, esc), chat.js (coordChip) and gate.js (me, logout).
const SHOW_LANDED_MIN = 30 // keep a landing on screen this long after it arrives
const MISSIONS = { attack: 'Attack', acs_attack: 'ACS attack', acs_defend: 'ACS defend', transport: 'Transport', deploy: 'Deploy', espionage: 'Espionage', harvest: 'Harvest', expedition: 'Expedition', moon_destruction: 'Moon destruction', colonize: 'Colonize' }
const HOSTILE = new Set(['attack', 'acs_attack', 'moon_destruction'])
const CATEGORY = { alert: 'Alert', opportunity: 'Opportunity', info: 'Info' }
const SOURCE = { event: 'event list', phalanx: 'phalanx scan', probe: 'probe report', ally: 'an ally' }
const isOurs = (o) => !!(o && o.alliance && o.alliance.toLowerCase() === ALLIES[0].toLowerCase()) // is this owner in our alliance?

// What should the alliance do about this flight? Alert: an attack on us (can be defended). Opportunity: an enemy fleet that will
// be at a known place at a known time. Info: everything else, including all of our own moves.
function categoryFor(whose, mission, coords) {
  if (whose !== 'theirs') return 'info'
  const o = world && ownerAt(world, coords)
  if (HOSTILE.has(mission)) return o && !isOurs(o) ? 'opportunity' : 'alert' // unknown target: assume it is us
  return mission === 'deploy' || mission === 'acs_defend' ? 'opportunity' : 'info'
}

let landings = []

async function loadLandings() {
  const since = new Date(Date.now() - SHOW_LANDED_MIN * 60000).toISOString()
  try {
    landings = await sb(`/rest/v1/landings?select=id,side,mission,category,galaxy,system,position,strength,arrives_at,origin_galaxy,origin_system,origin_position,returns_at,source,author,profiles(display_name)&or=${encodeURIComponent(`(arrives_at.gt.${since},returns_at.gt.${since})`)}&order=arrives_at.asc`, { token: await getToken() })
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

const clock = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })

// One flight is one row, but it can show up as two cards: the landing, and (for an enemy fleet whose launch planet we know)
// its return home, which is a chance to hit it there.
function cardsFor(l, since) {
  const cards = []
  const side = sideOf(l)
  if (new Date(l.arrives_at) > since) cards.push({ at: l.arrives_at, kind: 'landing', l, side })
  if (l.side === 'theirs' && l.returns_at && l.origin_galaxy && new Date(l.returns_at) > since) cards.push({ at: l.returns_at, kind: 'return', l, side })
  return cards
}

function renderLandings() {
  const since = new Date(Date.now() - SHOW_LANDED_MIN * 60000)
  const cards = landings.flatMap((l) => cardsFor(l, since))
  if (!cards.length) return (el('landings').innerHTML = '<p class="empty">No landings planned.</p>')
  // still-coming ones first (soonest first), recently landed ones after
  const upcoming = (c) => new Date(c.at) > Date.now()
  cards.sort((a, b) => upcoming(b) - upcoming(a) || new Date(a.at) - new Date(b.at))
  el('landings').innerHTML = cards.map(({ at, kind, l, side }) => {
    const mine = l.author === me.user.id
    const ret = kind === 'return'
    const where = ret ? [l.origin_galaxy, l.origin_system, l.origin_position] : [l.galaxy, l.system, l.position]
    const cat = ret ? 'opportunity' : l.category ?? (l.side === 'theirs' ? 'alert' : 'info')
    const mission = MISSIONS[l.mission] ?? 'Attack'
    const who = l.side === 'theirs' ? 'Enemy' : 'Ours'
    const title = ret ? 'Enemy fleet back home' : `${who} · ${side === 'move' && l.mission === 'attack' ? 'Move' : mission}`
    const note = ret ? `From the ${mission.toLowerCase()} above` : [
      l.origin_galaxy && `from ${coordChip(l.origin_galaxy, l.origin_system, l.origin_position)}`,
      l.returns_at && `back ${esc(clock(l.returns_at))}`,
      l.source && `seen via ${SOURCE[l.source] ?? ''}`,
    ].filter(Boolean).join(' · ')
    return `
      <div class="landing ${esc(cat)} ${upcoming({ at }) ? '' : 'landed'}">
        <div class="l-top">
          <span class="l-side">${esc(title)}</span><span class="l-cat">${esc(CATEGORY[cat] ?? cat)}</span>
          ${coordChip(...where)}
          ${ownerNote(where.join(':'))}
          <span class="l-strength">${esc(l.strength)}</span>
        </div>
        <div class="l-time"><b class="count" data-t="${esc(at)}"></b> <span>${esc(clock(at))}</span></div>
        ${note ? `<div class="l-note">${note}</div>` : ''}
        <div class="l-who">${esc(l.profiles?.display_name ?? '?')}${mine && !ret ? ` <button class="remove" data-id="${l.id}">Remove</button>` : ''}</div>
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

// Say who lives at the target. Our own fleet sent "against" a planet of our own alliance is logged as a fleet move.
function suggestMove() {
  const f = el('landing-form').elements
  const hint = el('landing-hint')
  hint.textContent = ''
  const coords = [f.galaxy.value, f.system.value, f.position.value].map(Number).join(':')
  const o = world && ownerAt(world, coords)
  if (!o) return
  const tag = o.alliance ? ` (${o.alliance})` : ''
  if (f.whose.value === 'ours' && HOSTILE.has(f.mission.value) && isOurs(o)) hint.textContent = `That is ${o.name}'s planet${tag}, so this will be logged as a fleet move, not an attack.`
  else if (f.whose.value === 'ours' && f.mission.value === 'deploy' && !isOurs(o)) hint.textContent = `Careful: that planet belongs to ${o.name}${tag}, not ${ALLIES[0]}. Is this really a deployment?`
  else hint.textContent = `${o.name}'s planet${tag}.`
}
for (const n of ['galaxy', 'system', 'position']) el('landing-form').elements[n].oninput = suggestMove
el('landing-form').elements.whose.onchange = suggestMove
el('landing-form').elements.mission.onchange = suggestMove

// "Say it all in one go": parse the sentence and fill in the form. The person checks it and taps Add.
el('say-fill').onclick = () => {
  const r = parseLanding(el('say').value)
  const f = el('landing-form').elements
  f.whose.value = r.side === 'theirs' ? 'theirs' : 'ours'
  f.mission.value = r.mission
  if (r.galaxy) [f.galaxy.value, f.system.value, f.position.value] = [r.galaxy, r.system, r.position]
  if (r.strength) f.strength.value = r.strength
  if (r.hours || r.minutes) [f.hours.value, f.minutes.value] = [r.hours, r.minutes]
  // these two are cleared when the sentence does not mention them, so an old sentence cannot leave stale values behind
  ;[f.og.value, f.os.value, f.op.value] = r.origin ? [r.origin.galaxy, r.origin.system, r.origin.position] : ['', '', '']
  ;[f.rhours.value, f.rminutes.value] = r.returnHours || r.returnMinutes ? [r.returnHours, r.returnMinutes] : ['', '']
  if (r.origin || r.returnHours || r.returnMinutes) el('landing-more').open = true
  suggestMove()
  const heard = [
    `${f.whose.value === 'theirs' ? 'Enemy' : 'Ours'} ${MISSIONS[r.mission].toLowerCase()}`,
    r.galaxy && `[${r.galaxy}:${r.system}:${r.position}]`,
    r.origin && `from [${r.origin.galaxy}:${r.origin.system}:${r.origin.position}]`,
    r.strength,
    (r.hours || r.minutes) && `lands in ${r.hours}h ${r.minutes}m`,
    (r.returnHours || r.returnMinutes) && `back in ${r.returnHours}h ${r.returnMinutes}m`,
  ].filter(Boolean).join(', ')
  el('say-result').textContent = r.missing.length === 3
    ? "Couldn't make sense of that. Please fill in the form below."
    : r.missing.length
    ? `Heard: ${heard}. Couldn't find: ${r.missing.join(', ')}. Please fill that in below.`
    : `Heard: ${heard}. Check it below, then tap Add landing.`
  if (r.note) el('say-result').textContent += ' ' + r.note
}

el('landing-form').onsubmit = async (e) => {
  e.preventDefault()
  const f = e.target.elements
  const msg = (t) => (el('landing-msg').textContent = t)
  const num = (x) => (x.value === '' ? null : Number(x.value))
  const [galaxy, system, position] = [f.galaxy.value, f.system.value, f.position.value].map(Number)
  const minutes = Number(f.hours.value || 0) * 60 + Number(f.minutes.value || 0)
  const returnMinutes = f.rhours.value || f.rminutes.value ? Number(f.rhours.value || 0) * 60 + Number(f.rminutes.value || 0) : null
  const strength = f.strength.value.trim()
  const mission = f.mission.value
  const maxPos = mission === 'expedition' ? 16 : 15
  if (!(galaxy >= 1 && galaxy <= MAX_GALAXY && system >= 1 && system <= 499 && position >= 1 && position <= maxPos)) return msg(`Coordinates look wrong (galaxy 1-${MAX_GALAXY}, system 1-499, planet 1-${maxPos}).`)
  if (!strength) return msg('How big is the fleet? A rough guess is fine.')
  if (!(minutes >= 1 && minutes <= 10080)) return msg('When does it land? Enter hours and/or minutes from now.')
  const origin = [num(f.og), num(f.os), num(f.op)]
  const given = origin.filter((x) => x !== null).length
  if (given && (given < 3 || !(origin[0] >= 1 && origin[0] <= MAX_GALAXY && origin[1] >= 1 && origin[1] <= 499 && origin[2] >= 1 && origin[2] <= 15))) {
    el('landing-more').open = true
    return msg('Launched from: fill in galaxy, system and planet, or leave all three empty.')
  }
  if (returnMinutes !== null && returnMinutes <= minutes) {
    el('landing-more').open = true
    return msg('Back home must be later than the landing time.')
  }
  const whose = f.whose.value
  const coords = `${galaxy}:${system}:${position}`
  const o = world && ownerAt(world, coords)
  // stored kind: enemy = theirs; ours against a planet of our own alliance (or a deployment) = move; any other of ours = ours
  const side = whose === 'theirs' ? 'theirs' : isOurs(o) || mission === 'deploy' ? 'move' : 'ours'
  const category = f.category.value === 'auto' ? categoryFor(whose, mission, coords) : f.category.value
  msg('')
  try {
    await sb('/rest/v1/rpc/add_flight', {
      method: 'POST', token: await getToken(),
      body: {
        p_side: side, p_mission: mission, p_category: category,
        p_galaxy: galaxy, p_system: system, p_position: position, p_strength: strength, p_minutes: minutes,
        p_origin_galaxy: given ? origin[0] : null, p_origin_system: given ? origin[1] : null, p_origin_position: given ? origin[2] : null,
        p_return_minutes: returnMinutes, p_source: f.source.value || null,
      },
    })
    notifyOthers('landing')
    e.target.reset()
    el('say-result').textContent = ''
    el('landing-hint').textContent = ''
    el('landing-more').open = false
    el('landing-add').open = false
    loadLandings()
  } catch (err) {
    if (err.status === 401) return logout()
    msg(err.message)
  }
}
