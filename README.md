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
Messages are plain text; `2:45:8` / `[2:45:8]` link to the galaxy view, `@name` is highlighted. New messages arrive by polling every 4s.
