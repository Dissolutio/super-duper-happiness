// Tiny dev server: serves ./public and proxies /api/* to the OGame server.
// The proxy exists because OGame's API doesn't send CORS headers, so the browser can't call it directly.
// (On Netlify, netlify.toml does the same proxying with a redirect.)
// Run: node server.js   (needs Node 18+, no npm install)
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3000
const BASE = process.env.OGAME_BASE || 'https://s265-us.ogame.gameforge.com'
const CACHE_MS = 5 * 60 * 1000 // the API only updates hourly/daily, don't hammer it
const PUBLIC = path.join(__dirname, 'public')
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }

const cache = {} // url -> { time, body }

// Report lookup by ID (third-party service, see README). Only this exact URL shape is passed on; anything else is a 404.
const REPORT_HOST = 'https://ogapi.faw-kes.de'
const REPORT_PATH = /^\/ogapi\/v1\/report\/((?:sr|cr)-us-265-[0-9a-f]{40})\/true$/

http
  .createServer(async (req, res) => {
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

    const report = req.url.match(REPORT_PATH)
    if (report) {
      try {
        const r = await fetch(`${REPORT_HOST}/v1/report/${report[1]}/true`, { signal: AbortSignal.timeout(15000) })
        res.statusCode = r.status
        res.setHeader('Content-Type', 'application/json')
        return res.end(await r.text())
      } catch (e) {
        res.statusCode = 502
        return res.end('report service unreachable')
      }
    }

    // static files, only from ./public (resolve + prefix check blocks ../ tricks)
    const urlPath = decodeURIComponent(req.url.split('?')[0])
    const file = path.resolve(PUBLIC, '.' + (urlPath === '/' ? '/index.html' : urlPath))
    if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
      return res.end(fs.readFileSync(file))
    }
    res.statusCode = 404
    res.end('not found')
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}  ->  ${BASE}`))
