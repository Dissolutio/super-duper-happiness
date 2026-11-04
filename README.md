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
(browser OGame: Inspect the report, copy the `messagedetails` element's outerHTML). The app reads it in your browser
(`public/reports.js`) and sends a small summary to the database through `add_intel()`; the raw page is never stored.

- One profile per in-game player, friend or enemy. Spy reports give drive/combat tech and the lifeform ship-speed bonuses; combat reports give weapons/shields/armour percentages.
- A newer report overrides only the values it shows (a thin report with few probes leaves older values alone). The same report pasted twice is ignored.
- The app never talks to the game; it only reads what you paste.
