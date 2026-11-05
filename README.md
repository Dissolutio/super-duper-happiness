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

## Alerts (push notifications)
Phones and computers get a notification for: an enemy landing, one of our attacks or fleet moves, or someone writing `@yourname` in chat. Each device picks what it wants (Alerts button, top right).
The message is encrypted on our server for that one device, so Google/Apple/Mozilla's push services only pass along something they can't read.

How it works: the app saves each device's push address (`supabase/push.sql`). After someone adds a landing or an @mention, their app asks our Netlify function (`netlify/functions/notify.mjs`) to tell the others.
The function checks the caller's login, looks up what they just added in the database (the caller can't choose the text), sends once per landing/message, and only to real push-service addresses.
`netlify/lib/push.mjs` is the encryption, written with Node's built-in crypto and checked against the example in RFC 8291.

### One-time setup
1. Run `supabase/push.sql` in the Supabase SQL editor.
2. On your own computer: `node scripts/vapid.mjs`. It prints a PUBLIC and a PRIVATE key.
3. Put the PUBLIC key in `public/config.js` as `VAPID_PUBLIC_KEY` and commit it (it is meant to be public).
4. In Netlify > Site configuration > Environment variables, add (mark the secret ones as secret):
   - `SUPABASE_URL` = the project URL (same as config.js)
   - `SUPABASE_PUBLISHABLE_KEY` = the publishable key (same as config.js)
   - `SUPABASE_SECRET_KEY` = a secret key from Supabase > Project Settings > API Keys. **Secret: only here, never in the repo or any chat.** If it ever leaks, delete it in Supabase and make a new one.
   - `VAPID_PUBLIC_KEY` = the PUBLIC key from step 2
   - `VAPID_PRIVATE_KEY` = the PRIVATE key from step 2. **Secret, same rules.**
5. Deploy again (Netlify only applies new variables to a new deploy).
6. In the app: Alerts, pick what you want, Turn on, Send a test. On iPhone the app must first be added to the Home Screen.

Not covered yet: reminders before a landing arrives (e.g. "lands in 10 minutes"). That needs a scheduled job.

## Players: other alliances and planet strips

The box under the roster tabs takes any alliance tag or name (autocomplete). That alliance takes the PMA tab; clear the box to get PMA back. Each card shows all of a player's planets left to right, galaxy 1 to 7, with a small dot for each moon. The star marks the capital. The OGame API does not say which planet is the capital, so we guess the oldest one (lowest planet id).

## Help button

The "?" in the header opens a short how-to (install on iPhone and Android, alerts, reports, players, landings). The text is plain HTML in the `help-sheet` dialog in `public/index.html`; `public/help.js` just opens and closes it. Update the text there when something changes.

## Flights (landings with missions and categories)

Run `supabase/flights.sql` once (after `landings.sql` and `landings-move.sql`; if you ran it before "return" existed, also run `flights-return.sql`). Each flight now has a mission (attack, ACS attack, ACS defend,
transport, deploy, espionage, harvest, expedition, moon destruction, colonize, return), an optional launch planet, an optional return time, how we know
(event list, phalanx, probe, ally), and a category the app picks:

- **Alert**: an enemy attack, ACS attack or moon destruction on us (or on a planet we cannot place), which can be defended.
- **Opportunity**: an enemy fleet at a known place and time: an enemy attack on a non-DONUT planet, an enemy deploy, ACS defend or return, and the return home of any enemy flight with a known launch planet (shown as its own card).
- **Info**: everything else, including all of our own flights.

Enemy flights in the info category do not send alerts. The dictation sentence (`public/parse.js`) understands the mission words, `from x y z` and `back in ...`.
The old `add_landing()` function is kept so a page that has not updated yet keeps working.

## War map

The Map tab (`public/map.js`) draws the universe from the same OGame data as the flight calculator. Whole-universe view: the 7 galaxies on a ring (galaxy 7 touches galaxy 1,
because the server wraps galaxies). Galaxy view: the 499 systems around a ring (system 499 touches system 1), a planet's distance from the middle is its planet number.
Orange = DONUT, red = the alliance in the second roster tab, moons are small dots, and flights with a known launch planet are arrows coloured by category.
Needs no database change.
