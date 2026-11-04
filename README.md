# DONUT vs PMA

Throwaway OGame dashboard for the Jishui (s265-us) alliance war. Reads the public OGame XML API.

    node server.js      # Node 18+, no npm install
    open http://localhost:3000

- `server.js` serves `public/` and proxies `/api/*` to OGame (the API has no CORS headers). Caches 5 min. Local only.
- `public/` is the whole site (also what Netlify publishes). `app.js` has the alliance tags to track at the top.
- `netlify.toml` does the `/api/*` proxying on Netlify and sets security headers (CSP etc.).
- It's an installable PWA (manifest + service worker).

API docs (unofficial): https://gist.github.com/psmolak/409d038fb4a9157aecf25c84110d5b55
