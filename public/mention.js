// @mention suggestions in the chat box.
// A strip of tappable names appears above the message box while you type "@" and the start of a name. It is plain buttons,
// not a native dropdown, so the phone keyboard behaves exactly as usual: tapping a name keeps the keyboard open, and we never
// look at key codes (Android keyboards report them unreliably); we only look at the text before the cursor.
// Only names the mention system can actually match are offered: letters, digits, _ . - (2 to 32 characters).
// Needs app.js (el, esc, sb, getToken, logout, me).

const MENTION = { people: [], loadedAt: 0, loading: null, range: null }
const MENTION_NAME = /^[\w.-]{2,32}$/

async function loadPeople() {
  if (Date.now() - MENTION.loadedAt < 5 * 60000) return
  MENTION.loading ??= (async () => {
    try {
      const rows = await sb('/rest/v1/profiles?select=id,display_name&approved=eq.true&order=display_name.asc', { token: await getToken() })
      MENTION.people = rows.filter((r) => r.id !== me.user.id && MENTION_NAME.test(r.display_name ?? '')).map((r) => r.display_name)
      MENTION.loadedAt = Date.now()
    } catch (e) {
      if (e.status === 401) logout()
      // no names: no suggestions. Typing @name by hand still works.
    } finally {
      MENTION.loading = null
    }
  })()
  await MENTION.loading
}

// the "@part" the cursor is right behind, or null
function mentionAtCursor() {
  const input = el('chat-input')
  if (input.selectionStart !== input.selectionEnd) return null
  const before = input.value.slice(0, input.selectionStart)
  const m = before.match(/(^|\s)@([\w.-]{0,32})$/)
  return m ? { start: input.selectionStart - m[2].length - 1, end: input.selectionStart, part: m[2].toLowerCase() } : null
}

async function updateMentions() {
  const at = mentionAtCursor()
  const bar = el('mention-bar')
  if (!at) return (bar.hidden = true)
  await loadPeople()
  if (mentionAtCursor()?.part !== at.part) return // the text moved on while we were loading
  const names = MENTION.people.filter((n) => n.toLowerCase().includes(at.part))
    .sort((a, b) => Number(b.toLowerCase().startsWith(at.part)) - Number(a.toLowerCase().startsWith(at.part)) || a.localeCompare(b))
    .slice(0, 8)
  if (!names.length || (names.length === 1 && names[0].toLowerCase() === at.part)) return (bar.hidden = true) // nothing to offer, or already typed in full
  MENTION.range = at
  bar.innerHTML = names.map((n) => `<button type="button" class="mention-chip" data-name="${esc(n)}">@${esc(n)}</button>`).join('')
  bar.hidden = false
  bar.scrollLeft = 0
}

function pickMention(name) {
  const input = el('chat-input')
  const at = MENTION.range
  if (!at) return
  const after = input.value.slice(at.end)
  const text = `@${name}${after.startsWith(' ') ? '' : ' '}` // a space after, so you can keep typing
  input.value = input.value.slice(0, at.start) + text + after
  const caret = at.start + text.length + (after.startsWith(' ') ? 1 : 0)
  input.focus()
  input.setSelectionRange(caret, caret)
  el('mention-bar').hidden = true
}

const mentionBar = el('mention-bar')
// keep the keyboard up: pressing a chip must not take focus away from the message box
for (const ev of ['pointerdown', 'mousedown']) mentionBar.addEventListener(ev, (e) => e.preventDefault())
mentionBar.addEventListener('click', (e) => {
  const b = e.target.closest('.mention-chip')
  if (b) pickMention(b.dataset.name)
})
el('chat-input').addEventListener('input', updateMentions)
el('chat-input').addEventListener('click', updateMentions)
el('chat-input').addEventListener('keyup', (e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && updateMentions())
el('chat-input').addEventListener('blur', () => setTimeout(() => (mentionBar.hidden = true), 150)) // after a chip tap had its chance
// Tab takes the first suggestion (computers)
el('chat-input').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || mentionBar.hidden) return
  const first = mentionBar.querySelector('.mention-chip')
  if (!first) return
  e.preventDefault()
  pickMention(first.dataset.name)
})
