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
