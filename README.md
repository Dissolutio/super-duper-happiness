# DONUT vs PMA

Throwaway OGame dashboard for the Jishui (s265-us) alliance war. Reads the public OGame XML API.

    node server.js      # Node 18+, no npm install
    open http://localhost:3000

- `server.js` serves the page and proxies `/api/*` to OGame (the API has no CORS headers). Caches 5 min.
- `index.html` is the whole UI. Alliance tags to track are at the top of the `<script>`.

API docs (unofficial): https://gist.github.com/psmolak/409d038fb4a9157aecf25c84110d5b55
