// Chat: one view per channel, new messages arrive by polling every few seconds.
// Needs auth.js (sb, getToken) and app.js (el, esc, $). Channels are the buttons in #views (see index.html).
const POLL_MS = 4000
const GAME_URL = 'https://s265-us.ogame.gameforge.com/game/index.php'
const MAX_GALAXY = 7 // Jishui has 7 galaxies (serverData.xml)

const chat = { channel: null, lastId: 0, busy: false, timer: null, lastTime: null } // lastTime = when the newest message shown was sent

// A tappable [g:s:p] chip. Tapping it opens the coordinate card (see bottom of this file).
const coordChip = (g, s, p) => `<button type="button" class="coord" data-g="${g}" data-s="${s}" data-p="${p}">[${g}:${s}:${p}]</button>`

// Message text -> safe HTML. Everything is escaped FIRST, then we add our own tags:
//   2:45:8 or [2:45:8]  -> tappable coordinate chip
//   @name               -> highlighted mention
function renderBody(text) {
  return esc(text)
    .replace(/\[?\b(\d):(\d{1,3}):(\d{1,2})\b\]?/g, (m, g, s, p) => {
      if (g < 1 || g > MAX_GALAXY || s < 1 || s > 499 || p < 1 || p > 15) return m
      return coordChip(g, s, p)
    })
    .replace(/@([\w.-]{2,32})/g, '<span class="mention">@$1</span>')
    .replace(/\n/g, '<br>')
}

const timeOf = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// A line to put above a message, or '' for none: a day label when the day changes,
// or "5h later" after a long quiet spell (2 hours or more) on the same day.
function dividerLabel(time, prev) {
  if (!prev || time.toDateString() !== prev.toDateString()) {
    const yesterday = new Date(Date.now() - 86400000)
    if (time.toDateString() === new Date().toDateString()) return 'Today'
    if (time.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const hours = Math.floor((time - prev) / 3600000)
  return hours >= 2 ? `${hours}h later` : ''
}

function addMessages(rows, forceScroll) {
  const nearBottom = innerHeight + scrollY >= document.body.scrollHeight - 80
  el('msgs').insertAdjacentHTML('beforeend', rows.map((m) => {
    const time = new Date(m.created_at)
    const label = dividerLabel(time, chat.lastTime)
    chat.lastTime = time
    return `${label ? `<div class="divider"><span>${esc(label)}</span></div>` : ''}
    <div class="msg-row ${m.author === me.user.id ? 'mine' : ''}">
      <div class="meta"><b>${esc(m.profiles?.display_name ?? '?')}</b> <time>${esc(timeOf(time))}</time></div>
      <div class="body">${renderBody(m.body)}</div>
    </div>`
  }).join(''))
  if (forceScroll || nearBottom) scrollTo(0, document.body.scrollHeight)
}

async function poll() {
  const channel = chat.channel
  if (!channel || chat.busy) return
  if (channel === 'targets') loadLandings()
  chat.busy = true
  try {
    const first = chat.lastId === 0
    const query = first ? '&order=id.desc&limit=100' : `&id=gt.${chat.lastId}&order=id.asc`
    const rows = await sb(`/rest/v1/messages?select=id,body,created_at,author,profiles(display_name)&channel=eq.${channel}${query}`, { token: await getToken() })
    if (channel !== chat.channel) return // switched channels while waiting
    if (first) rows.reverse()
    if (rows.length) {
      addMessages(rows, first && channel !== 'targets') // Targets opens at the top so the landings are the first thing you see
      chat.lastId = rows[rows.length - 1].id
    }
    el('chat-msg').textContent = ''
  } catch (e) {
    if (e.status === 401) return logout()
    el('chat-msg').textContent = e.message
  } finally {
    chat.busy = false
  }
}

function showView(view) { // 'data', 'players' or a channel slug
  const isChat = view !== 'data' && view !== 'players'
  clearInterval(chat.timer)
  chat.channel = isChat ? view : null
  chat.lastId = 0
  chat.lastTime = null
  el('data').hidden = view !== 'data'
  el('intel').hidden = view !== 'players'
  el('chat').hidden = !isChat
  el('landings-box').hidden = view !== 'targets'
  $('#views button').forEach((b) => b.classList.toggle('active', b.dataset.view === view))
  if (typeof closePlayer === 'function') closePlayer()
  if (view === 'players') {
    loadIntel()
    loadCalc()
    if (!matchMedia('(pointer: coarse)').matches) el('intel-paste').focus() // computers: ready to paste. On phones focusing would pop the keyboard up.
  }
  if (!isChat) return
  el('msgs').innerHTML = ''
  poll()
  chat.timer = setInterval(() => !document.hidden && poll(), POLL_MS)
}

function stopChat() {
  clearInterval(chat.timer)
  chat.channel = null
}

async function send() {
  const input = el('chat-input')
  const body = input.value.trim()
  if (!body) return
  el('chat-send').disabled = true
  try {
    await sb('/rest/v1/messages', { method: 'POST', body: { channel: chat.channel, body }, token: await getToken() })
    input.value = ''
    await poll() // pick up our own message (and anyone else's)
  } catch (e) {
    if (e.status === 401) return logout()
    el('chat-msg').textContent = e.message
  } finally {
    el('chat-send').disabled = false
  }
}

el('views').onclick = (e) => {
  const b = e.target.closest('button')
  if (b) showView(b.dataset.view)
}
el('chat-form').onsubmit = (e) => { e.preventDefault(); send() }
// on a computer Enter sends (Shift+Enter = new line); on a phone Enter is a new line, use the button
el('chat-input').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send() }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll() })

// ---- coordinate card: big separate numbers (the game app has one box each), tap one to copy it ----
const coordSheet = el('coord-sheet')

document.addEventListener('click', (e) => {
  const chip = e.target.closest('button.coord')
  if (!chip) return
  const [g, s, p] = [chip.dataset.g, chip.dataset.s, chip.dataset.p].map(Number)
  el('cn-g').textContent = g
  el('cn-s').textContent = s
  el('cn-p').textContent = p
  el('coord-copied').textContent = ''
  el('coord-open').href = `${GAME_URL}?page=ingame&component=galaxy&galaxy=${g}&system=${s}&position=${p}`
  coordSheet.showModal()
})

el('coord-nums').onclick = async (e) => {
  const b = e.target.closest('button')
  if (!b) return
  const value = b.querySelector('b').textContent
  try {
    await navigator.clipboard.writeText(value)
    el('coord-copied').textContent = `Copied ${value}`
  } catch {
    el('coord-copied').textContent = 'Could not copy, just type it in.'
  }
}
el('coord-close').onclick = () => coordSheet.close()
coordSheet.onclick = (e) => { if (e.target === coordSheet) coordSheet.close() } // tap outside the card
