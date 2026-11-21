# How it works (for people changing the code)

The setup guide is the main [README](../README.md). This file explains each feature and where its code lives.

    node server.js      # Node 18+, no npm install, then open http://localhost:3000 (and /demo/)

- Plain JavaScript, no build tools or frameworks: `public/` is the whole site, classic scripts sharing globals (load order is in `public/index.html`). Before adding a global, check no other file uses the name.
- `server.js` serves `public/` locally and proxies `/api/*` to the game (the API has no CORS headers). On Netlify, `scripts/build.mjs` writes the same proxies as `public/_redirects`.
- It's an installable PWA (manifest + service worker).

API docs (unofficial): https://gist.github.com/psmolak/409d038fb4a9157aecf25c84110d5b55

## Chat

Channels are rows in `public.channels` plus a button in `#views` in `public/index.html`.
Messages are plain text; `2:45:8` / `[2:45:8]` become tappable chips that open a coordinate card (big separate galaxy / system / planet numbers, tap one to copy, plus "Open in browser"); `@name` is highlighted. New messages arrive by polling every 4s.

## Landings

Pinned at the top of Targets: a list of fleets landing (ours or enemy incoming) with live
countdowns in each viewer's timezone, and a collapsed "+ Add a landing" form. Arrival time is computed on the server (now + minutes from now).

"Say it all in one go" (top of the add-landing form) uses `public/parse.js` to turn a sentence like
`enemy 2 45 8, about 3 million, lands in 2 hours 15 minutes` into form fields. It only fills the form; the person checks and taps Add.
Digits only (phone dictation writes "45" not "forty five").

## Players (intel from pasted reports)
On the Players tab, paste an opened spy or combat report
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

How it works: the app saves each device's push address (the `push_subscriptions` table). After someone adds a landing or an @mention, their app asks our Netlify function (`netlify/functions/notify.mjs`) to tell the others.
The function checks the caller's login, looks up what they just added in the database (the caller can't choose the text), sends once per landing/message, and only to real push-service addresses.
`netlify/lib/push.mjs` is the encryption, written with Node's built-in crypto and checked against the example in RFC 8291.

Setup: see "Turn on alerts" in the main README.

## Players: other alliances and planet strips

The box under the roster tabs takes any alliance tag or name (autocomplete). That alliance takes the PMA tab; clear the box to get PMA back. Each card shows all of a player's planets left to right, galaxy 1 to 7, with a small dot for each moon. The star marks the capital. The OGame API does not say which planet is the capital, so the app marks the oldest one (lowest planet id), which has matched every real capital checked so far.

## Help button

The Help item in the header menu (the hamburger) opens a short how-to (install on iPhone and Android, alerts, reports, players, landings). The text is plain HTML in the `help-sheet` dialog in `public/index.html`; `public/help.js` just opens and closes it. Update the text there when something changes.

## Flights (landings with missions and categories)

Each flight now has a mission (attack, ACS attack, ACS defend,
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

Zoom (pinch, double-tap, wheel, + / -, up to 12x) changes only the SVG viewBox while a finger moves; on release the map is redrawn for that zoom
(dots and text stay a steady size on screen, planet names appear from 3.5x without overlapping, only planets near the screen are drawn).
The overview in the corner shows the visible part; the find box jumps to a player (fits their planets in their main galaxy) or to coordinates.

Moons: Tap a planet that has a moon, tick "Has a jump gate" and/or enter its phalanx level, and save (stored in `moons`, readable by approved members, written only through `set_moon()`).
Gates are drawn as green rings joined by dotted lines per owner; a phalanx level draws the systems it reaches (level squared minus 1, each way, wrapping round the galaxy) and lists the second alliance's planets in range. Until the SQL is run the map still works, only saving moons fails.

Moons from spy reports: a spy report on a moon that shows its buildings (pasted page or report id) sets that moon's phalanx level (building 42) and jump gate (building 43)
through `set_moon_seen()`. Only a report newer than what we already know counts (`observed_at`); typed-in values count as seen "now".
Until then a moon report still updates the player, and the paste result says the moon could not be saved.

Map filter: by default the map hides inactive players and players with no alliance who are weaker (total points, `highscore.xml?category=1&type=0`) than our weakest DONUT player.
DONUT, the second tab's alliance and whoever is tapped or searched for always show; other alliances show unless inactive. The button under the map toggles "show everyone".

@mention suggestions (`public/mention.js`): typing @ shows a strip of tappable names above the chat box (approved members whose display name is letters, digits, _ . - only, which is what mention alerts can match). Plain buttons, no native dropdown, so the phone keyboard is untouched.

Layout: the header is one slim row with a hamburger menu (Help, Alerts, Change name, Sign out; `public/menu.js`). The Map screen fills the window and the page does not scroll
(`body.map-active`): galaxy tabs on top, then the map with everything else as overlays (legend, zoom readout, overview, and buttons for full screen, search, the lens button, zoom and reset).
Tapping a planet opens its details as a sheet over the bottom of the map, and the map slides so the planet stays visible above the sheet.

## Map lenses

The map's lens button cycles through ways of looking at the universe (`public/lens.js`): What matters (default), Everyone, Big fleets, Ripe targets and Ripe anywhere. The hunting lenses rank non-DONUT players (not on vacation or banned, at least as big as our weakest DONUT player) and show the best 40, heat-coloured, with a "why" line in the planet sheet.

- Data: the daily highscore files for total, economy, research and military points (`loadWorld` in `flight.js` fills `world.stats`). Military points include defence, so a high fleet share can also be a turtle.
- Size floor: a target's fleet (military points, times the ships share when scanned) must be at least 25% of a typical (median) DONUT member's military, and its total at least 25% of a typical DONUT total (`MIN_FLEET_VS_US`, `MIN_TOTAL_VS_US` in `lens.js`). This drops new and tiny accounts that are "all ships" but not worth a trip.
- Big fleets: half fleet share, half fleet size (both percentile ranks).
- Ripe anywhere: Ripe targets without distance, for choosing where to place a planet: 0.3 fleet size + 0.3 fleet share + 0.15 neglected research + 0.125 no alliance + 0.125 inactive.
- Ripe targets: 0.25 fleet size + 0.25 fleet share + 0.2 closeness to our planets + 0.1 neglected research + 0.1 no alliance + 0.1 inactive. All shares are percentile ranks within the pool, so there are no fixed cutoffs; tune the weights in `huntBoard`.
- Scans: spy reports added by pasting the page also save the value of the ships and defence on that planet or moon (`scans` table, written by `add_scan()`, readable by members). The lenses use scans up to 14 days old: ships / (ships + defence) scales the player's military share, so turtles drop and fleeters stay. Reports added by ID do not include these numbers yet. A report that shows neither (both 0) is ignored, since hidden and empty look the same.

## Public alliance page (`showcase/`)
A separate, public, no-login page for the alliance: the universe map with DONUT (or any alliance picked at the top, shareable as `?a=TAG`) in orange and everyone else faint, galaxy tabs, pinch/wheel zoom, a tap card per planet, and the member list (tap a member to find them). It is deliberately its own site, not a route of the war room.
- Standalone code in `showcase/site/` (no shared scripts, no Supabase, no keys, nothing from `public/`). It reads only the game's public files through fixed redirects that `scripts/build.mjs` writes, cached 15 minutes.
- Deploy: in Netlify, **Add new site > Import from Git**, pick this repo, set **Base directory** to `showcase` (it reads `showcase/netlify.toml`: build command and publish dir `site` are set there). Then choose a neutral site name (Site configuration > Change site name), because the name is the URL.
- **All the words** (title, recruiting box, achievements, System remarks, footer) live in `showcase/site/copy.js`, with editing rules at the top. Text there can't inject HTML: it is escaped, and only `**bold**` and `{placeholders}` are understood.
- Preview locally: `SITE=showcase/site node server.js`.
- It shows only what anyone can already see in the game's galaxy view. It must never show war-room data (flights, moons, scans, lenses, intel).

## Settings (`public/config.js`)
Everything that ties the app to one server and one war lives in `public/config.js`: game server, galaxies, our and the enemy alliance tag, the report-lookup switch, the Supabase URL and publishable key, and the public push key. Everything in it is public.

On every Netlify deploy, `scripts/build.mjs` checks that file and writes the files that depend on it: `public/_redirects` (the proxies to the game's public API, and the report lookup if it is on), `public/_headers` (security headers with your Supabase address), and the public alliance page's `site-config.js` and `_redirects`. Those generated files are not committed. A mistake in `config.js`, for example a **secret** key pasted where the publishable key goes, stops the deploy with an explanation. Run `node scripts/build.mjs` to check it yourself; `node server.js` uses the same settings.

## Updating the database
`supabase/setup.sql` always builds the latest database for a new install. An existing database is moved forward with the numbered files in `supabase/migrations/` (see the README there): check `select version from public.schema_version;` and run every newer file once, in order. A database built from the old loose files (now in `supabase/legacy/`, including DONUT's own) runs `0001-from-legacy-files.sql` first, which also allows galaxies up to 9.

## Demo (`/demo/`)
A no-login demo of the whole app at `/demo/` on any deploy (and `http://localhost:3000/demo/` with `node server.js`). It shows an invented universe, "Crumbspace" (s999-us), with DONUT against an invented enemy, GRIM: about 420 players, 60 alliances, flights, chat, moons with gates and phalanxes, scans and spy intel. Every name except DONUT is made up from syllables; the shape (how many players are inactive, planets per player, busy galaxies and slots) copies a real universe.
- Files: `public/demo/config.js` (fake settings), `public/demo/data.js` (the seeded universe), `public/demo/demo.js` (answers every request in memory). `scripts/build.mjs` makes `public/demo/index.html` from `public/index.html`.
- It cannot touch a real database: requests never leave the page (demo.js answers them), its security policy allows no outside address, and it keeps its own pretend login, so a real War Room login in the same browser is never read or changed.
- Anything added in the demo is gone on reload. Alerts and report-id lookups are off.

## Planet details (Players > a player)
The planet diagram squeezes galaxies without planets and zooms each other galaxy to the systems in use (numbers under it). Tapping a planet, or its row, opens what we know about that planet and its moon: the latest spy scan of each (fleet and defence values, ship and defence counts, mine/shipyard levels, moon facilities, resources), gate and phalanx, and an account-wide fleet estimate (military points times the ships share of recent scans) with combat tech.
- Breakdowns come from pasted report pages (`data-raw-fleet`, `-defense`, `-buildings`, `-resources`), stored per planet/moon in `scans` (migration 0002). Unit names and costs are in `public/units.js`; costs reproduce the game's own fleet/defence values exactly.
- Report-id lookups: counts are read if the lookup returns them (format not verified), and values are worked out from the costs.

## Battles (☰ > Battles)
Combat reports are also kept whole in `battles` (migration 0003, `add_battle()`), as the shape described at the top of `public/battle-parse.js`: fleets with each unit's real weapon / shield / hull from the report, the count of every unit after each round, each side's shots, firepower and the damage its shields stopped, and the result (losses, debris, loot, moon chance, rebuilt defences). Both the report page and the report-id lookup give the same shape (checked on a real report both ways).
- `public/battles.js` lists them (DONUT vs enemy first, or all) and replays one round by round; "draws X% of enemy shots" = that type's share of its side's units at the start of the round (targets are random). The notes ("What happened") are worked out from the same numbers.
- The demo's battles are simulated by a small version of the game's combat in `public/demo/data.js` (random targets, 1% shield bounce, shields recharge, explosions below 70% hull, the main rapid-fire pairs).
