# 🔒 Security

## Reporting a problem in the code

Found a way for someone to read or change war-room data they shouldn't, get around the login, or run code in someone else's browser? Please **don't open a public issue** (that tells everyone before it's fixed).

Report it privately instead: on this repository's GitHub page, go to **Security** > **Report a vulnerability**. Say what you found and how to reproduce it. Please give us a reasonable time to fix it before telling anyone else.

If the problem is in **your own** war room (a leaked key, a member who shouldn't have access), you don't need us. Follow the "Security" section of the [README](README.md): rotate the key or remove the member.

## How it's protected (short version)

- **Logins and data** are in Supabase. Every table has Row-Level Security: not signed in = nothing; signed in but not approved by an admin = nothing; approved = read, and writes only through database functions that check their input.
- **The browser only ever holds the publishable key.** The secret key lives only in Netlify's environment variables, used by the alerts function. That function checks the caller's login and builds the message text itself.
- **The game is never touched.** The app reads only the game's public data files and reports that members paste by hand. It never asks for game logins.
- **Security headers:** a strict Content-Security-Policy (scripts only from the site itself, network only to the site and your Supabase project), no framing, no referrer. The demo page allows no outside network at all.
- **The deploy refuses secret-looking keys** in `public/config.js` (`scripts/read-config.cjs`).
- **Alerts** are encrypted for each device (RFC 8291) before they go to Google, Apple or Mozilla's push services.

## Known trade-offs

- Report-id lookups go to a third-party service (ogapi.faw-kes.de) when `REPORT_LOOKUP` is on. It can see which reports are looked up.
- Every approved member can read everything. There are no per-member permissions.
- The app stays signed in on a device until someone signs out.
