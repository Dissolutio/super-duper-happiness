// Thin Supabase auth client using plain fetch (no library). Needs config.js loaded first.
// The session (tokens) lives in localStorage so you stay logged in; the access token is refreshed automatically.
const SESSION_KEY = 'sb-session'

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
function saveSession({ access_token, refresh_token, expires_in }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token, refresh_token, expires_at: Math.floor(Date.now() / 1000) + Number(expires_in) }))
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

// one request to Supabase. `token` is the logged-in user's access token (omit when logged out).
async function sb(path, { method = 'GET', body, token } = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  const r = await fetch(SUPABASE_URL + path, { method, headers, body: body && JSON.stringify(body) })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const err = new Error(data?.msg || data?.error_description || data?.message || 'error ' + r.status)
    err.status = r.status
    throw err
  }
  return data
}

let refreshing = null // so two callers at once don't both use the (single-use) refresh token
async function refreshSession() {
  const s = loadSession()
  if (!s) return null
  refreshing ??= sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } })
    .then((t) => { saveSession(t); return t.access_token })
    .catch(() => { clearSession(); return null })
    .finally(() => { refreshing = null })
  return refreshing
}

// a valid access token, or null if logged out
async function getToken() {
  const s = loadSession()
  if (!s) return null
  if (s.expires_at - Date.now() / 1000 < 60) return refreshSession()
  return s.access_token
}

async function signIn(email, password) {
  saveSession(await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }))
}

async function signOut() {
  const token = await getToken()
  if (token) await sb('/auth/v1/logout', { method: 'POST', token }).catch(() => {}) // best effort
  clearSession()
}

const sendPasswordReset = (email) => sb('/auth/v1/recover', { method: 'POST', body: { email } })

async function setPassword(password) {
  await sb('/auth/v1/user', { method: 'PUT', body: { password }, token: await getToken() })
}

// Invite and password-reset emails send people back here with the session in the URL #fragment.
// Returns { type: 'invite' | 'recovery' } or { error } or null. Always scrubs the fragment from the address bar.
function consumeLinkSession() {
  const p = new URLSearchParams(location.hash.slice(1))
  if (!location.hash) return null
  if (p.get('error')) {
    history.replaceState(null, '', location.pathname)
    return { error: p.get('error_description') || p.get('error') }
  }
  if (p.get('access_token') && p.get('refresh_token') && ['invite', 'recovery'].includes(p.get('type'))) {
    saveSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') || 3600 })
    history.replaceState(null, '', location.pathname)
    return { type: p.get('type') }
  }
  return null
}

// who am I + my profile row. Throws (status 401) if the session is bad.
async function getMe() {
  const token = await getToken()
  if (!token) throw Object.assign(new Error('not logged in'), { status: 401 })
  const user = await sb('/auth/v1/user', { token })
  const rows = await sb(`/rest/v1/profiles?select=display_name,approved,is_admin&id=eq.${encodeURIComponent(user.id)}`, { token })
  return { user, profile: rows[0] ?? null }
}
