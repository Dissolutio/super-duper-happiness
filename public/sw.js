// Minimal service worker: makes the app installable and openable offline.
// Network first, so you always get fresh code when online. The OGame API (/api/) is never cached here.
const CACHE = 'shell-v1'

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
        }
        return r
      })
      .catch(() => caches.match(e.request))
  )
})

// Notifications. The server sends { title, body, tag, url } already encrypted for this device.
// A visible notification must be shown for every push (browsers require it), so we always show one.
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data.json() } catch { /* empty or unreadable message: show the generic one */ }
  e.waitUntil(self.registration.showNotification(String(d.title || 'DONUT War Room'), {
    body: String(d.body || 'Something new. Open the app.'),
    tag: d.tag ? String(d.tag) : undefined,
    icon: '/icon-192.png',
    data: { url: '/' }, // always our own front page, whatever the message said
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => (open.length ? open[0].focus() : clients.openWindow('/')))
  )
})
