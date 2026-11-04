# DONUT vs PMA

Throwaway OGame dashboard for the Jishui (s265-us) alliance war. Reads the public OGame XML API.

    node server.js      # Node 18+, no npm install
    open http://localhost:3000

- `server.js` serves `public/` and proxies `/api/*` to OGame (the API has no CORS headers). Caches 5 min. Local only.
- `public/` is the whole site (also what Netlify publishes). `app.js` has the alliance tags to track at the top.
- `netlify.toml` does the `/api/*` proxying on Netlify and sets security headers (CSP etc.).
- It's an installable PWA (manifest + service worker).

API docs (unofficial): https://gist.github.com/psmolak/409d038fb4a9157aecf25c84110d5b55

## Login (Supabase)

Only invited, approved people get in. One-time setup:

1. Supabase dashboard -> SQL Editor -> run `supabase/schema.sql`.
2. Authentication -> Sign In / Providers -> turn OFF "Allow new users to sign up". Set minimum password length to 10+.
3. Authentication -> URL Configuration -> Site URL = your Netlify URL; add `http://localhost:3000` to Redirect URLs.
4. Authentication -> Users -> Invite user (yourself first). Click the email link, choose a password.
5. Run the "approve + admin" SQL at the bottom of `schema.sql` with your email.

Each new player: invite them in step 4, they set a password from the email link, then you run the "approve a player" SQL.

`public/config.js` holds the project URL and publishable key (public by design). Never commit the secret key or DB password.

## Chat

Run `supabase/chat.sql` (after `schema.sql`). Channels are rows in `public.channels` plus a button in `#views` in `public/index.html`.
Messages are plain text; `2:45:8` / `[2:45:8]` become tappable chips that open a coordinate card (big separate galaxy / system / planet numbers, tap one to copy, plus "Open in browser"); `@name` is highlighted. New messages arrive by polling every 4s.

## Landings

Run `supabase/landings.sql` (after `schema.sql`). Pinned at the top of Targets: a list of fleets landing (ours or enemy incoming) with live
countdowns in each viewer's timezone, and a collapsed "+ Add a landing" form. Arrival time is computed on the server (now + minutes from now).

"Say it all in one go" (top of the add-landing form) uses `public/parse.js` to turn a sentence like
`enemy 2 45 8, about 3 million, lands in 2 hours 15 minutes` into form fields. It only fills the form; the person checks and taps Add.
Digits only (phone dictation writes "45" not "forty five").

## Players (intel from pasted reports)
Run `supabase/intel.sql` in the Supabase SQL editor (after `schema.sql`). On the Players tab, paste an opened spy or combat report
(browser OGame: Inspect the report, copy the `messagedetails` element's outerHTML), **or just paste report ids** (see below). The app reads it in your browser
(`public/reports.js`) and sends a small summary to the database through `add_intel()`; the raw page is never stored.

- One profile per in-game player, friend or enemy. Spy reports give drive/combat tech and the lifeform ship-speed bonuses; combat reports give weapons/shields/armour percentages.
- A newer report overrides only the values it shows (a thin report with few probes leaves older values alone). The same report pasted twice is ignored.
- The app never talks to the game; it only reads what you paste.

### Report ids (easy for phone users)
In the game, a report's key icon shows an id like `sr-us-265-<40 hex>` (spy) or `cr-us-265-<40 hex>` (combat). Paste one or several (one per line).
The app asks `/ogapi/v1/report/<id>/true`, which `server.js` / `netlify.toml` pass on to **ogapi.faw-kes.de**, a private third-party service
(operator named on its imprint page; it logs requests for up to 30 days, so it can see which reports we look up and who spied on whom).
Accepted precautions: only the exact id shape is passed on, the answer must carry the id we asked for, everything is re-validated by `add_intel()`,
and profile cards say "(looked up by id)". The pasted-page route sends nothing outside our own system, so use it for anything sensitive.

## Flight calculator (Players tab)
`public/flight.js` is the maths, `public/calc.js` the screen. Pick From and To (type coordinates, or look up a player's planets and tap one), a ship, mission and speed,
and whose tech to use: anyone we have a spy report on (drives and lifeform speed fill in), or type your own. Settings are remembered in this browser.
- Formula and server rules (fleet speed 8 peaceful / 1 war, wraparound, empty and inactive systems skipped, target system always counts) are read from `serverData.xml`, `universe.xml` and `players.xml`.
- Checked against four real in-game recycler times (21m58s / 31m23s deployment, 19m54s / 28m25s transport), all exact.
- A fleet flies at its slowest ship, so the calculator takes one ship. Universe data is up to a week old, so a route can be off by a system near new or changed planets.

## Players tab layout
Add a report (open, ready to paste) comes first, then the flight calculator (closed), then the roster: Known players, one tab per alliance in `ALLIES` (shows how many members have a spy report), and a search box for any player in the universe.
Tap a player for their page: tech, lifeform speed, last fight, and every known planet with a tappable coordinate and the flight time from the calculator's From box.
After a paste the app says how many players were updated, or "No new intel" (already added, nothing changed, or we already hold newer data).
