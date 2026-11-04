// Tiny dev server: serves index.html and proxies /api/* to the OGame server.
// The proxy exists because OGame's API doesn't send CORS headers, so the browser can't call it directly.
// Run: node server.js   (needs Node 18+, no npm install)
const http = require('http')
const fs = require('fs')

const PORT = 3000
const BASE = process.env.OGAME_BASE || 'https://s265-us.ogame.gameforge.com'
const CACHE_MS = 5 * 60 * 1000 // the API only updates hourly/daily, don't hammer it

const cache = {} // url -> { time, body }

http
  .createServer(async (req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html')
      return res.end(fs.readFileSync(__dirname + '/index.html'))
    }
    if (req.url.startsWith('/api/')) {
      try {
        const hit = cache[req.url]
        if (!hit || Date.now() - hit.time > CACHE_MS) {
          const r = await fetch(BASE + req.url)
          if (!r.ok) throw new Error('upstream ' + r.status)
          cache[req.url] = { time: Date.now(), body: await r.text() }
        }
        res.setHeader('Content-Type', 'text/xml')
        return res.end(cache[req.url].body)
      } catch (e) {
        res.statusCode = 502
        return res.end(String(e))
      }
    }
    res.statusCode = 404
    res.end('not found')
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}  ->  ${BASE}`))
