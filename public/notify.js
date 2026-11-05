// Alerts: turn push notifications on or off for THIS device, and pick what to hear about.
// The browser gives us an address for this device; we store it (with a few settings) via save_push() and the server uses it.
// Needs auth.js (sb, getToken), app.js (el), config.js (VAPID_PUBLIC_KEY) and gate.js (logout).

const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const ON_IPHONE = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const INSTALLED = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

const keyToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
const currentSub = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription()
const prefs = () => ({ p_enemy: el('np-enemy').checked, p_ours: el('np-ours').checked, p_mention: el('np-mention').checked })
const alertMsg = (t) => (el('notify-status').textContent = t)

async function openNotify() {
  el('notify-sheet').showModal()
  for (const b of ['notify-on', 'notify-test', 'notify-off']) el(b).hidden = true
  el('notify-prefs').hidden = true
  if (!PUSH_OK || (ON_IPHONE && !INSTALLED)) {
    return alertMsg(ON_IPHONE ? 'On iPhone, alerts only work from the installed app: tap Share, then Add to Home Screen, open the war room from that icon, and come back here.' : "This browser can't do alerts.")
  }
  if (!VAPID_PUBLIC_KEY) return alertMsg('Alerts are not set up yet.')
  if (Notification.permission === 'denied') return alertMsg('Alerts are blocked for this site. Allow notifications for it in your browser or phone settings, then reopen this.')
  el('notify-prefs').hidden = false
  const sub = await currentSub()
  if (!sub) {
    el('notify-on').hidden = false
    return alertMsg('Off on this device. Pick what you want to hear about, then turn it on.')
  }
  // already on: show what is saved for this device
  try {
    const [row] = await sb(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}&select=on_enemy,on_ours,on_mention`, { token: await getToken() })
    if (row) [el('np-enemy').checked, el('np-ours').checked, el('np-mention').checked] = [row.on_enemy, row.on_ours, row.on_mention]
  } catch { /* keep the defaults */ }
  el('notify-on').hidden = false
  el('notify-on').textContent = 'Save'
  el('notify-test').hidden = false
  el('notify-off').hidden = false
  alertMsg('On for this device.')
}

async function saveSub(sub) {
  const k = sub.toJSON()
  await sb('/rest/v1/rpc/save_push', { method: 'POST', token: await getToken(), body: { p_endpoint: k.endpoint, p_p256dh: k.keys.p256dh, p_auth: k.keys.auth, ...prefs() } })
}

el('notify-btn').onclick = openNotify
el('notify-close').onclick = () => el('notify-sheet').close()

el('notify-on').onclick = async () => { // Turn on / Save. Must run from a tap, or phones refuse to ask for permission.
  try {
    let sub = await currentSub()
    if (!sub) {
      if ((await Notification.requestPermission()) !== 'granted') return alertMsg('Permission was not given, so alerts stay off.')
      sub = await (await navigator.serviceWorker.ready).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) })
    }
    await saveSub(sub)
    alertMsg('Saved. Alerts are on for this device.')
    el('notify-on').textContent = 'Save'
    el('notify-test').hidden = false
    el('notify-off').hidden = false
  } catch (e) {
    if (e.status === 401) return logout()
    alertMsg('Could not turn on alerts: ' + e.message)
  }
}

el('notify-off').onclick = async () => {
  try {
    const sub = await currentSub()
    if (sub) {
      await sb(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', token: await getToken() })
      await sub.unsubscribe()
    }
    el('notify-sheet').close()
  } catch (e) {
    alertMsg('Could not turn off alerts: ' + e.message)
  }
}

// ask the server to send us a test alert, or to tell everyone else about what we just added (landing / @mention)
async function callNotify(type) {
  const r = await fetch('/.netlify/functions/notify', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await getToken()) }, body: JSON.stringify({ type }),
  })
  return { ok: r.ok, data: await r.json().catch(() => ({})) }
}
const notifyOthers = (type) => { callNotify(type).catch(() => {}) } // best effort: the landing or message is already saved either way

el('notify-test').onclick = async () => {
  alertMsg('Sending...')
  try {
    const { ok, data } = await callNotify('test')
    alertMsg(!ok ? data.error || 'The server could not send it.' : data.sent ? 'Sent. It should appear in a moment.' : 'The server has no saved device for you. Tap Save, then try again.')
  } catch {
    alertMsg('Could not reach the server.')
  }
}
