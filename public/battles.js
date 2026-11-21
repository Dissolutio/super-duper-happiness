// The Battles screen: every combat report someone added, and a round-by-round replay of one.
// What the replay shows comes straight from the report (counts after each round, shots, firepower, damage the shields
// stopped); the "draws X% of fire" numbers and the notes under the title are worked out from those, see battleNotes().
// Needs battle-parse.js (the battle shape), units.js, lens.js (shortNum, ageText), chat.js (coordChip, showView),
// app.js (el, esc, ALLIES) and auth.js (sb, getToken).

const BATTLES = { list: null, filter: 'war', open: null, round: 0, timer: 0 }
const ROUND_MS = 1800
const SIDE_NAME = { a: 'Attackers', d: 'Defenders' }

const tagsOurs = (tags) => tags.some((t) => t.toLowerCase() === ALLIES[0].toLowerCase())
const tagsTheirs = (tags) => tags.some((t) => t.toLowerCase() === ALLIES[1].toLowerCase())
const isWar = (b) => (tagsOurs(b.attacker_tags) && tagsTheirs(b.defender_tags)) || (tagsTheirs(b.attacker_tags) && tagsOurs(b.defender_tags))
const fmtInt = (n) => Math.round(n).toLocaleString('en-US')
const pct = (x) => `${Math.round(x * 100)}%`

el('battles-btn').onclick = () => showView('battles')

async function openBattles() {
  el('battle-view').hidden = true
  el('battle-list-box').hidden = false
  if (!BATTLES.list) {
    el('battle-list').innerHTML = '<p class="hint">Loading...</p>'
    try {
      BATTLES.list = await sb('/rest/v1/battles?select=hash,fought_at,galaxy,system,position,winner,attacker_tags,defender_tags,lost_attacker,lost_defender&order=fought_at.desc&limit=200', { token: await getToken() })
    } catch (e) {
      if (e.status === 401) return logout()
      el('battle-list').innerHTML = `<p class="hint">Could not load battles${/battles|PGRST205|relation/i.test(e.message) ? ': the database needs update 0003 (see the README).' : `: ${esc(e.message)}`}</p>`
      return
    }
    if (!BATTLES.list.some(isWar)) BATTLES.filter = 'all'
  }
  renderBattleList()
}

function renderBattleList() {
  const war = BATTLES.list.filter(isWar)
  el('battle-filter').innerHTML = [['war', `${ALLIES[0]} vs ${ALLIES[1]} (${war.length})`], ['all', `All (${BATTLES.list.length})`]]
    .map(([k, label]) => `<button type="button" data-f="${k}" class="${BATTLES.filter === k ? 'on' : ''}">${esc(label)}</button>`).join('')
  const rows = BATTLES.filter === 'war' ? war : BATTLES.list
  el('battle-list').innerHTML = rows.length ? rows.map(battleCard).join('')
    : '<p class="empty">No battles yet. Add a combat report on the Players screen (paste the report page, or its cr- id) and it shows up here.</p>'
}

function battleCard(b) {
  const tags = (list) => (list.length ? list.map(esc).join(' + ') : '?')
  const ours = tagsOurs(b.attacker_tags) ? 'a' : tagsOurs(b.defender_tags) ? 'd' : null
  const won = b.winner === 'draw' ? 'Draw' : `${b.winner === 'attacker' ? 'Attacker' : 'Defender'} won`
  const mood = !ours || b.winner === 'draw' ? '' : (b.winner === 'attacker') === (ours === 'a') ? ' win' : ' loss'
  return `<button type="button" class="card battle-card${isWar(b) ? ' war' : ''}" data-hash="${esc(b.hash)}">
    <div class="top"><span class="name">&#9876; ${tags(b.attacker_tags)} <small>vs</small> ${tags(b.defender_tags)}</span><span class="rank${mood}">${won}</span></div>
    <div class="hint">[${b.galaxy}:${b.system}:${b.position}] &middot; ${ageText(Date.parse(b.fought_at))} ago &middot; lost ${shortNum(Number(b.lost_attacker))} / ${shortNum(Number(b.lost_defender))}</div>
  </button>`
}

el('battle-filter').onclick = (e) => {
  const b = e.target.closest('button[data-f]')
  if (!b) return
  BATTLES.filter = b.dataset.f
  renderBattleList()
}
el('battle-list').onclick = (e) => {
  const c = e.target.closest('.battle-card')
  if (c) openBattle(c.dataset.hash)
}

async function openBattle(hash) {
  stopBattle()
  let rows
  try {
    rows = await sb(`/rest/v1/battles?select=data,added_by&hash=eq.${encodeURIComponent(hash)}`, { token: await getToken() })
  } catch (e) {
    if (e.status === 401) return logout()
    return alert('Could not open that battle: ' + e.message)
  }
  if (!rows?.length) return
  BATTLES.open = rows[0].data
  BATTLES.openMine = rows[0].added_by === me?.user?.id
  BATTLES.round = 0
  el('battle-list-box').hidden = true
  el('battle-view').hidden = false
  renderBattle()
  el('battle-view').scrollIntoView({ block: 'start' })
}

function stopBattle() {
  clearInterval(BATTLES.timer)
  BATTLES.timer = 0
}

// counts of every fleet before round r (r = 0: the start; after the last round: the end)
function countsAt(b, r) {
  if (r === 0) return Object.fromEntries(b.fleets.map((f) => [f.key, Object.fromEntries(Object.entries(f.units).map(([id, u]) => [id, u.n]))]))
  return b.rounds[r - 1].left
}
const sideUnits = (b, side, counts) => b.fleets.filter((f) => f.side === side).reduce((t, f) => t + Object.values(counts[f.key] ?? {}).reduce((s, n) => s + n, 0), 0)
const sideValue = (b, side, counts) => b.fleets.filter((f) => f.side === side).reduce((t, f) => t + Object.entries(counts[f.key] ?? {}).reduce((s, [id, n]) => s + n * unitCost(id), 0), 0)

function renderBattle() {
  const b = BATTLES.open, r = BATTLES.round, last = b.rounds.length
  const before = countsAt(b, Math.max(0, r - 1)), now = countsAt(b, r), start = countsAt(b, 0)
  const tags = (side) => [...new Set(b.fleets.filter((f) => f.side === side).map((f) => f.tag || f.name))]
  const ours = tagsOurs(tags('a')) ? 'a' : tagsOurs(tags('d')) ? 'd' : null
  const won = b.winner === 'draw' ? 'Draw' : `${b.winner === 'attacker' ? 'Attackers' : 'Defenders'} won`
  const steps = Array.from({ length: last + 1 }, (_, i) => `<button type="button" data-r="${i}" class="${i === r ? 'on' : ''}">${i === 0 ? 'Start' : `R${i}`}</button>`).join('')
  el('battle-view').innerHTML = `
    <button type="button" id="battle-back">&larr; Battles</button>
    <h3>&#9876; ${esc(tags('a').join(' + '))} <small>attack</small> ${esc(tags('d').join(' + '))}</h3>
    <p class="hint">${coordChip(...b.coords.split(':'))} ${b.moon ? 'moon' : 'planet'} &middot; ${new Date(b.at * 1000).toLocaleString()} &middot; <b class="${ours && b.winner !== 'draw' ? ((b.winner === 'attacker') === (ours === 'a') ? 'win' : 'loss') : ''}">${won}</b> after ${last} round${last === 1 ? '' : 's'}</p>
    <div class="battle-steps">${steps}<button type="button" id="battle-play">${BATTLES.timer ? '&#10074;&#10074; Pause' : '&#9654; Play'}</button></div>
    <div class="battle-round">${roundText(b, r)}</div>
    <div class="battle-sides">${['a', 'd'].map((side) => sidePanel(b, side, start, before, now, r)).join('')}</div>
    ${r === last ? `<div class="battle-end">${endText(b)}</div>` : ''}
    <h4>What happened</h4>
    <ul class="battle-notes">${battleNotes(b).map((n) => `<li>${n}</li>`).join('')}</ul>
    ${BATTLES.openMine ? '<button type="button" id="battle-delete" class="link">Delete this battle</button>' : ''}`
}

// one round in words: who fired how much, and how much the other side's shields stopped
function roundText(b, r) {
  if (r === 0) {
    const s = countsAt(b, 0)
    return `<p><b>Start.</b> ${SIDE_NAME.a}: ${fmtInt(sideUnits(b, 'a', s))} units worth ${shortNum(sideValue(b, 'a', s))}. ${SIDE_NAME.d}: ${fmtInt(sideUnits(b, 'd', s))} units worth ${shortNum(sideValue(b, 'd', s))}. Tap a round or Play.</p>`
  }
  const x = b.rounds[r - 1], before = countsAt(b, r - 1), after = countsAt(b, r)
  const fire = (side, other) => {
    const f = x[side], stopped = x[other].absorbed
    const through = Math.max(0, f.strength - stopped)
    return `<p><b>${SIDE_NAME[side]}</b> fire ${fmtInt(f.hits)} shots, ${shortNum(f.strength)} damage. The ${SIDE_NAME[other].toLowerCase()}' shields stop ${shortNum(stopped)} (${f.strength ? pct(stopped / f.strength) : '0%'}), ${shortNum(through)} hits hulls.</p>`
  }
  const lost = (side) => `${fmtInt(sideUnits(b, side, before) - sideUnits(b, side, after))} units (${shortNum(sideValue(b, side, before) - sideValue(b, side, after))})`
  return `<p class="rnum">Round ${r}</p>${fire('a', 'd')}${fire('d', 'a')}<p>Lost this round: ${SIDE_NAME.a.toLowerCase()} ${lost('a')}, ${SIDE_NAME.d.toLowerCase()} ${lost('d')}.</p>`
}

// one side: each fleet, each unit type as a swarm of dots (one dot = several units), dots lost this round flash red
function sidePanel(b, side, start, before, now, r) {
  const total = sideUnits(b, side, before) || 1
  const fleets = b.fleets.filter((f) => f.side === side)
  const body = fleets.map((f) => {
    const p = f.pct ?? {}
    const rows = Object.keys(f.units).sort((x, y) => Number(x) - Number(y)).map((id) => {
      const n0 = start[f.key]?.[id] ?? 0, nb = before[f.key]?.[id] ?? 0, nn = now[f.key]?.[id] ?? 0
      const dots = Math.min(40, n0), per = n0 / dots
      const alive = nn > 0 ? Math.max(1, Math.round(nn / per)) : 0, wasAlive = nb > 0 ? Math.max(1, Math.round(nb / per)) : 0
      let swarm = ''
      for (let i = 0; i < dots; i++) swarm += `<i class="${i < alive ? 'up' : i < wasAlive && r > 0 ? 'hit' : 'gone'}"></i>`
      const u = f.units[id]
      const share = nb / total
      return `<div class="unit-row">
        <div class="unit-head"><span>${esc(unitName(id))}</span><span>${fmtInt(nn)}<small> / ${fmtInt(n0)}</small></span></div>
        <div class="swarm" title="one dot = ${fmtInt(per)}">${swarm}</div>
        <div class="unit-meta">draws ${pct(share)} of enemy shots &middot; hull ${shortNum(u.h)} shield ${shortNum(u.s)} weapon ${shortNum(u.w)}</div>
      </div>`
    }).join('')
    return `<div class="bfleet"><div class="bfleet-head">${esc(f.name || '?')}${f.tag ? ` <small>(${esc(f.tag)})</small>` : ''} <small>${f.from ? `from [${esc(f.from)}]${f.fromMoon ? ' moon' : ''} &middot; ` : ''}W${p.w ?? '?'} S${p.s ?? '?'} A${p.a ?? '?'}%</small></div>${rows}</div>`
  }).join('')
  const tags = fleets.map((f) => f.tag)
  const tone = tagsOurs(tags) ? ' ours' : tagsTheirs(tags) ? ' theirs' : ''
  return `<div class="bside${tone}"><h4>${SIDE_NAME[side]}</h4>${body}</div>`
}

function endText(b) {
  const res = (x) => [['metal', x.m], ['crystal', x.c], ['deuterium', x.d]].filter(([, v]) => v > 0).map(([k, v]) => `${shortNum(v)} ${k}`).join(', ') || 'nothing'
  const repaired = Object.entries(b.repaired ?? {}).filter(([, n]) => n > 0).map(([id, n]) => `${fmtInt(n)} ${unitName(id)}`).join(', ')
  return `<p><b>Result.</b> ${SIDE_NAME.a} lost ${shortNum(b.lost.a)}, ${SIDE_NAME.d.toLowerCase()} lost ${shortNum(b.lost.d)}.</p>
    <p>Debris: ${res(b.debris)}. Loot: ${res(b.loot)}.${b.moonChance ? ` Moon chance ${b.moonChance}%${b.moonMade ? ', and a moon was made!' : '.'}` : ''}${repaired ? ` Rebuilt after the fight: ${esc(repaired)}.` : ''}</p>`
}

// Plain-language lessons from this battle. Each is worked out from the report's own numbers.
function battleNotes(b) {
  const notes = []
  const start = countsAt(b, 0), end = countsAt(b, b.rounds.length)
  const other = { a: 'd', d: 'a' }
  for (const side of ['a', 'd']) {
    const name = SIDE_NAME[side].toLowerCase(), enemy = SIDE_NAME[other[side]].toLowerCase()
    // shields: how much of the enemy's damage this side's shields stopped over the whole fight
    const incoming = b.rounds.reduce((t, x) => t + x[other[side]].strength, 0), stopped = b.rounds.reduce((t, x) => t + x[side].absorbed, 0)
    if (incoming > 0 && stopped / incoming >= 0.35) notes.push(`The ${name}' shields stopped ${pct(stopped / incoming)} of everything the ${enemy} fired. Shields recharge every round, and a shot weaker than 1% of a shield bounces off completely, so lots of weak guns can do almost nothing to well-shielded units.`)
    // per type: start count, survivors, value
    const types = {}
    for (const f of b.fleets.filter((x) => x.side === side)) {
      for (const id of Object.keys(f.units)) {
        types[id] ??= { n0: 0, n1: 0 }
        types[id].n0 += start[f.key]?.[id] ?? 0
        types[id].n1 += end[f.key]?.[id] ?? 0
      }
    }
    const n0 = Object.values(types).reduce((t, x) => t + x.n0, 0), n1 = Object.values(types).reduce((t, x) => t + x.n1, 0)
    if (!n0) continue
    // fodder: one cheap type that is most of the units draws most of the enemy's shots
    const [fid, fod] = Object.entries(types).sort((x, y) => y[1].n0 - x[1].n0)[0]
    const big = Object.entries(types).filter(([id, x]) => unitCost(id) >= 50000 && x.n0 >= 3 && !['407', '408'].includes(id)) // shield domes are not "bigger ships"
    const fodLost = 1 - fod.n1 / fod.n0
    const bigLost = big.length ? 1 - big.reduce((t, [, x]) => t + x.n1, 0) / big.reduce((t, [, x]) => t + x.n0, 0) : 0
    if (fod.n0 / n0 >= 0.5 && unitCost(fid) <= 12000 && big.length && fodLost > bigLost) {
      notes.push(`Fodder: the ${name}' ${fmtInt(fod.n0)} ${esc(unitName(fid))} were ${pct(fod.n0 / n0)} of their units. Every shot picks a target at random, so they drew about that share of the ${enemy}' fire. They lost ${pct(fodLost)} of them, while their bigger ships (${big.map(([id]) => esc(unitName(id))).join(', ')}) lost ${pct(bigLost)}.`)
    }
    // tough survivors: expensive units that came through while the rest of the side was shredded
    if (1 - n1 / n0 >= 0.5) {
      for (const [id, x] of Object.entries(types)) {
        if (unitCost(id) >= 100000 && x.n0 > 0 && x.n1 / x.n0 >= 0.8) notes.push(`${esc(unitName(id))}: ${x.n1} of ${x.n0} survived although the ${name} lost ${pct(1 - n1 / n0)} of their units. A unit only dies once its hull is below 70% and it fails a roll, and their huge hull and shields need many hits to get there.`)
      }
    }
    // rapid fire: more shots than units
    const r1 = b.rounds[0]?.[side]
    const units0 = sideUnits(b, side, start)
    if (r1 && units0 && r1.hits >= units0 * 1.3) notes.push(`In round 1 the ${name} fired ${fmtInt(r1.hits)} shots with ${fmtInt(units0)} units: the extra shots are rapid fire, some units fire again after a hit on a unit type they are strong against.`)
    if (n1 === 0) {
      const r = b.rounds.findIndex((x) => sideUnits(b, side, x.left) === 0) + 1
      notes.push(`The ${name} were wiped out${r ? ` in round ${r}` : ''}.`)
    }
  }
  if (b.winner === 'draw') notes.push(`${b.rounds.length} rounds and both sides still standing: a draw. The attackers fly home with what is left and take no loot.`)
  if (!notes.length) notes.push('Nothing unusual: the bigger side won.')
  return notes
}

el('battle-view').onclick = async (e) => {
  if (e.target.closest('#battle-back')) { stopBattle(); return openBattles() }
  const step = e.target.closest('button[data-r]')
  if (step) { stopBattle(); BATTLES.round = Number(step.dataset.r); return renderBattle() }
  if (e.target.closest('#battle-play')) {
    if (BATTLES.timer) { stopBattle(); return renderBattle() }
    if (BATTLES.round >= BATTLES.open.rounds.length) BATTLES.round = 0
    BATTLES.timer = setInterval(() => {
      BATTLES.round++
      if (BATTLES.round >= BATTLES.open.rounds.length) stopBattle()
      renderBattle()
    }, ROUND_MS)
    return renderBattle()
  }
  if (e.target.closest('#battle-delete')) {
    if (!confirm('Delete this battle for everyone?')) return
    try {
      await sb(`/rest/v1/battles?hash=eq.${encodeURIComponent(BATTLES.open.hash)}`, { method: 'DELETE', token: await getToken() })
    } catch (err) {
      if (err.status === 401) return logout()
      return alert('Could not delete it: ' + err.message)
    }
    BATTLES.list = null
    openBattles()
  }
}
