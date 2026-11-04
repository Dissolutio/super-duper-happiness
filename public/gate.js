// Decides what to show: login, set-password (from invite/reset email), waiting-for-approval, or the app.
// Needs auth.js and app.js loaded first.
const screens = ['login', 'setpw', 'pending', 'app']
let me = null // { user, profile } once logged in; chat.js uses it
function show(name, message = '') {
  if (name !== 'app') stopChat()
  screens.forEach((s) => (el(s).hidden = s !== name))
  if (message) el(name === 'app' ? 'status' : name + '-msg').textContent = message
}
const say = (id, text) => (el(id).textContent = text)

async function enter() {
  try {
    me = await getMe()
    const { user, profile } = me
    if (!profile?.approved) {
      say('pending-who', user.email)
      return show('pending')
    }
    show('app')
    showView('data')
    refresh()
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      clearSession()
      return show('login')
    }
    show('login', 'Could not reach the server: ' + e.message)
  }
}

el('login-form').onsubmit = async (e) => {
  e.preventDefault()
  say('login-msg', '')
  try {
    await signIn(el('email').value.trim(), el('password').value)
    el('password').value = ''
    enter()
  } catch (err) {
    say('login-msg', err.message)
  }
}

el('forgot').onclick = async () => {
  const email = el('email').value.trim()
  if (!email) return say('login-msg', 'Type your email above first.')
  try {
    await sendPasswordReset(email)
    say('login-msg', 'If that email has an account, a reset link is on its way.') // same answer either way
  } catch (err) {
    say('login-msg', err.message)
  }
}

el('setpw-form').onsubmit = async (e) => {
  e.preventDefault()
  const pw = el('newpw').value
  if (pw.length < 10) return say('setpw-msg', 'Use at least 10 characters.')
  if (pw !== el('newpw2').value) return say('setpw-msg', 'Passwords do not match.')
  try {
    await setPassword(pw)
    el('newpw').value = el('newpw2').value = ''
    enter()
  } catch (err) {
    say('setpw-msg', err.message)
  }
}

async function logout() {
  await signOut()
  show('login')
}
el('signout').onclick = logout

el('rename').onclick = async () => {
  const name = prompt('Display name (shown in chat, 32 characters max):', me.profile.display_name)?.trim()
  if (!name || name === me.profile.display_name) return
  if (name.length > 32) return alert('32 characters max.')
  try {
    await sb('/rest/v1/profiles?id=eq.' + encodeURIComponent(me.user.id), { method: 'PATCH', body: { display_name: name }, token: await getToken() })
    me.profile.display_name = name
  } catch (err) {
    alert(err.message)
  }
}
el('pending-signout').onclick = logout

// ---- start ----
const link = consumeLinkSession()
if (link?.type) show('setpw')
else if (link?.error) show('login', link.error)
else enter()
