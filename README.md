# 🍩 War Room: a private command centre for an OGame alliance

A phone-friendly web app for one alliance at war. Members log in, share incoming and outgoing fleets with live countdowns, chat with tappable coordinates, keep intel from spy and combat reports, mark moons with jump gates and sensor phalanxes, and hunt targets on a zoomable map of the whole universe. It can send push alerts to phones when an attack is logged or someone is @mentioned.

**👀 Try the demo first:** `https://<your-site>/demo/` on any deploy, or the original at **https://donutwarroom.netlify.app/demo/**. It's an invented universe with fake players, so nothing there is real and nothing you do is saved.

<!-- 📸 SCREENSHOT: 00-demo-overview.png — three phone screenshots side by side: Targets (flights), Map (a hunting lens), Players -->

You get your **own copy** of everything: your own database, your own website, your own members. Nobody else (including the people who wrote this) can see your alliance's data.

---

## 📋 Contents

1. [Is this allowed by OGame?](#-is-this-allowed-by-ogame)
2. [What you need](#-what-you-need)
3. [Setup, step by step](#-setup-step-by-step) (about 45 minutes the first time)
4. [Turn on alerts (optional)](#-turn-on-alerts-optional)
5. [Adding and removing members](#-adding-and-removing-members)
6. [🚨 Security: read this before you invite anyone](#-security-read-this-before-you-invite-anyone)
7. [Updating to a newer version](#-updating-to-a-newer-version)
8. [The public alliance page (optional)](#-the-public-alliance-page-optional)
9. [Troubleshooting](#-troubleshooting)
10. [Costs and limits](#-costs-and-limits)
11. [For developers](#-for-developers)

---

## ⚖️ Is this allowed by OGame?

OGame's rules on tools are here: [Important for users about toleration and tolerated tools](https://forum.origin.ogame.gameforge.com/forum/thread/320-important-for-users-about-toleration-and-tolerated-tools/). Read them yourself; this section is not legal advice and not a promise from Gameforge.

What this app does and does **not** do:

| ✅ Does | 🚫 Never does |
|---|---|
| Reads the game's **public** data files (`/api/universe.xml`, `players.xml`, `alliances.xml`, `highscore.xml`, `serverData.xml`), the same files every stats site uses | Asks for, stores or uses your **game login** |
| Reads reports that a member **pastes in by hand** | Opens, clicks, scans or automates the game in any way |
| Optionally looks up a pasted report **id** at a third-party service, ogapi.faw-kes.de (you can switch this off) | Runs inside the game page (no browser extension, no userscript) |

The rules treat standalone websites where you paste reports or look up public stats as allowed without toleration. **Toleration status of this tool:** _not yet reviewed by the OGame Origin team_ (update this line if that changes). Only use the latest version from this repository, and don't add anything that automates the game.

---

## 🧰 What you need

- 💻 A computer for the setup. A phone works for most steps but is painful.
- 🐙 A free [GitHub](https://github.com) account, to hold your copy of the code.
- 🗄️ A free [Supabase](https://supabase.com) account: the database and the logins.
- 🌐 A free [Netlify](https://www.netlify.com) account: the website.
- 🔢 Only for alerts: [Node.js](https://nodejs.org) 18 or newer on your computer, to run one command once.
- 🔐 A password manager. You'll create a few things that must stay secret.

> 🔐 **Turn on two-factor login (2FA) on GitHub, Supabase and Netlify before you start.** Whoever gets into any of those three accounts gets your whole war room.

---

## 🚀 Setup, step by step

> 💡 Menus on these sites move around now and then. If a button has a slightly different name, look for the closest match.

### Step 1: Make your own copy of the code

1. On this repository's GitHub page, click **Fork** (top right). Keep the name or pick a new one.
2. Your fork is **public** (anyone can read it). That's fine: nothing secret ever goes in the code. **Never commit a password or secret key to it**, because git keeps history forever.

<!-- 📸 SCREENSHOT: 01-github-fork.png — the Fork button on GitHub -->

### Step 2: Create the database (Supabase)

1. In Supabase, click **New project**.
   - **Name:** anything, for example `war-room`.
   - **Database password:** click *Generate*, save it in your password manager. You won't need it for normal use. 🔐 **Never share it.**
   - **Region:** the one closest to most of your members.
2. Wait until the project is ready (a minute or two).
3. Open **SQL Editor** > **New query**. Open [`supabase/setup.sql`](supabase/setup.sql) from your fork, copy **the whole file**, paste it in and click **Run**.
   You should see **"Success. No rows returned"**. Run it only once.

<!-- 📸 SCREENSHOT: 02-supabase-sql-editor.png — SQL editor with setup.sql pasted and the Success message -->

4. Go to **Authentication** > **Sign In / Providers** (or *Providers* > *Email*):
   - Turn **OFF** "Allow new users to sign up". 🚨 Important: only people you invite should get accounts.
   - Set the **minimum password length** to 10 or more.

<!-- 📸 SCREENSHOT: 03-supabase-signups-off.png — the "Allow new users to sign up" switch turned off -->

5. Go to **Project Settings** > **API Keys** (or *Data API*) and copy two things into a note:
   - the **Project URL**, like `https://abcdefghijkl.supabase.co`
   - the **publishable** key (`sb_publishable_...`). Older projects call it the **anon** key.

   🚨 The same page also shows a **secret** key (`sb_secret_...`, or *service_role* on older projects). **Do not copy that one anywhere** except the alerts step later. It bypasses every protection in the database.

<!-- 📸 SCREENSHOT: 04-supabase-api-keys.png — API keys page, publishable key highlighted, secret key covered -->

### Step 3: Fill in your settings

All your settings live in one file: [`public/config.js`](public/config.js). Everything in it is public on purpose.

1. On GitHub, open `public/config.js` in your fork and click the ✏️ pencil (Edit).
2. Change:

   | Setting | What to put | Example |
   |---|---|---|
   | `OGAME_SERVER` | The start of your game's address: `https://s123-en.ogame.gameforge.com` → | `'s123-en'` |
   | `GALAXIES` | How many galaxies your universe has | `7` |
   | `OUR_ALLIANCE` | Your alliance tag, exactly as in the game | `'DONUT'` |
   | `ENEMY_ALLIANCE` | The tag of the alliance you're fighting | `'PMA'` |
   | `REPORT_LOOKUP` | `true` lets members paste report ids, which are looked up at ogapi.faw-kes.de. `false` keeps everything in-house (members paste whole report pages instead). | `true` |
   | `SUPABASE_URL` | Project URL from step 2 | `'https://abcdefghijkl.supabase.co'` |
   | `SUPABASE_KEY` | The **publishable** key from step 2 | `'sb_publishable_...'` |
   | `VAPID_PUBLIC_KEY` | Leave `''` for now (alerts come later) | `''` |

3. Click **Commit changes**.

<!-- 📸 SCREENSHOT: 05-github-edit-config.png — config.js open in the GitHub editor -->

> 🛡️ If you ever paste a **secret** key here by mistake, the next deploy stops with a warning. Then delete that key in Supabase and make a new one: it was public the moment you committed it.

> ⚠️ The app reads reports and dictated flights in **English**. Servers in other languages can use the map, chat and flights, but report pasting may not understand non-English reports yet.

### Step 4: Put the website online (Netlify)

1. In Netlify: **Add new site** (or *Add new project*) > **Import an existing project** > **GitHub**, and pick your fork.
2. Leave the build settings as they are. The repository already tells Netlify what to do.
3. Click **Deploy**. After a minute, open the deploy log: near the end it should say
   `✅ config ok: s123-en, DONUT vs PMA, ...`
   If it says `✋ public/config.js needs fixing`, it lists what to fix. Fix it on GitHub, and Netlify redeploys by itself.
4. **Site configuration** > **Change site name**: pick something that doesn't give away your alliance, for example `blue-falcon-hq`. That name is your web address: `https://blue-falcon-hq.netlify.app`.

<!-- 📸 SCREENSHOT: 06-netlify-deploy-log.png — the deploy log with the "config ok" line -->

### Step 5: Tell Supabase where your site lives

Back in Supabase: **Authentication** > **URL Configuration**:
- **Site URL:** your Netlify address, like `https://blue-falcon-hq.netlify.app`
- **Redirect URLs:** add the same address, plus `http://localhost:3000` if you'll ever run it on your own computer.

This makes invite and password-reset emails link to your site.

<!-- 📸 SCREENSHOT: 07-supabase-url-config.png -->

### Step 6: Make yourself the first member and admin

1. Supabase: **Authentication** > **Users** > **Invite user**, and enter your own email.
2. Open the email, click the link and choose a password (10+ characters, from your password manager).
3. Back in **SQL Editor**, run this with **your** email:

   ```sql
   update public.profiles set approved = true, is_admin = true
   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
   ```

4. Open your site and sign in. 🎉 You should see the War Room with your alliance on the map.

<!-- 📸 SCREENSHOT: 08-first-login.png — the app right after the first sign-in -->

### Step 7: Install it on phones

- **Android (Chrome):** open the site > ⋮ menu > **Add to Home screen** / **Install app**.
- **iPhone (Safari):** open the site > Share button > **Add to Home Screen**. iPhones need this for alerts to work (iOS 16.4 or newer).

<!-- 📸 SCREENSHOT: 09-install-android.png and 10-install-iphone.png -->

---

## 🔔 Turn on alerts (optional)

Alerts send a phone notification when someone logs an enemy attack, one of your attacks or fleet moves, or writes `@yourname` in chat. Each phone chooses which ones it wants.

1. On your computer, in your fork's folder (or any copy of the code), run:
   ```
   node scripts/vapid.mjs
   ```
   It prints a **PUBLIC** and a **PRIVATE** key. 🔐 Save the private one in your password manager.
2. Put the **PUBLIC** key in `public/config.js` as `VAPID_PUBLIC_KEY` and commit.
3. In Netlify: **Site configuration** > **Environment variables** > **Add a variable**, and add these five. Tick **"Contains secret values"** for the two marked 🔐:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL (same as config.js) |
   | `SUPABASE_PUBLISHABLE_KEY` | the publishable key (same as config.js) |
   | `SUPABASE_SECRET_KEY` 🔐 | Supabase > Project Settings > API Keys > **create a new secret key** just for this |
   | `VAPID_PUBLIC_KEY` | the PUBLIC key from step 1 |
   | `VAPID_PRIVATE_KEY` 🔐 | the PRIVATE key from step 1 |

4. **Deploys** > **Trigger deploy**, because new variables only apply to a new deploy.
5. In the app: ☰ menu > **Alerts** > choose what you want > **Turn on** > **Send a test**.

<!-- 📸 SCREENSHOT: 11-netlify-env-vars.png — the variables list, values hidden -->

> 📱 **Android:** if the test never arrives, long-press the app icon > App info / Site settings > Notifications, and allow them (some phones block the category).
> 🍎 **iPhone:** alerts only work when the app was added to the Home Screen (step 7) and opened from there.

---

## 👥 Adding and removing members

**Add someone:**
1. Supabase > **Authentication** > **Users** > **Invite user**, with their email.
2. They click the link in the email and choose a password.
3. You approve them in the **SQL Editor**:
   ```sql
   update public.profiles set approved = true
   where id = (select id from auth.users where email = 'THEIR_EMAIL_HERE');
   ```
Until you approve them, they can log in but see nothing.

**Remove someone** (they left the alliance, or you don't trust them any more), right away:
```sql
update public.profiles set approved = false
where id = (select id from auth.users where email = 'THEIR_EMAIL_HERE');
```
Or delete them under **Authentication** > **Users**. Either way they lose access at once.

> 🕵️ Every approved member can read **everything**: all flights, chat, intel and moons. Approve only people you'd trust with your fleet times, and remove people the day they leave.

---

## 🚨 Security: read this before you invite anyone

Your war room holds information your enemies would love: when your fleets land, where your moons and gates are, who you're about to hit. These are the ways it can go wrong, and how to avoid them.

### 🔑 Know your keys

| Thing | Where it lives | If it leaks |
|---|---|---|
| Supabase **publishable** key, Project URL, VAPID **public** key | `public/config.js` (public by design) | Nothing. On their own they can't read anything. |
| Supabase **secret / service_role** key 🔐 | Only Netlify environment variables | **Full access to all your data**, skipping every protection. Delete it in Supabase and make a new one right away, then update Netlify. |
| VAPID **private** key 🔐 | Only Netlify environment variables (and your password manager) | Someone could send fake alerts to your members. Make a new pair (alerts step 1) and update both places. Members turn alerts on again. |
| Database password 🔐 | Your password manager | Full access. Reset it in Supabase > Project Settings > Database. |
| Your GitHub / Supabase / Netlify logins 🔐 | You | Full control of everything. Use 2FA. |

### ✅ Checklist

- [ ] 2FA is on for GitHub, Supabase and Netlify.
- [ ] "Allow new users to sign up" is **off** in Supabase.
- [ ] No secret key, private key or password is anywhere in your repository. Search your fork for `sb_secret`, `service_role` and `PRIVATE` once in a while.
- [ ] The secret key and VAPID private key are only in Netlify, marked as secret.
- [ ] Only people you trust are approved, and people who leave are removed the same day.
- [ ] Your site name doesn't advertise what it is.

### ⚠️ Dangers worth knowing

- **Git never forgets.** A secret that was committed even for one minute is leaked, even after you delete it: forks and copies may already have it. Don't try to hide it. **Rotate it** (make a new one, delete the old one).
- **Never paste keys into chats**, Discord, screenshots or AI assistants. Cover them in screenshots.
- **Phishing.** The War Room never asks for your OGame password. Members should only sign in at your real site address. Tell them to be suspicious of look-alike links.
- **Report ids go to a third party** when `REPORT_LOOKUP` is `true`. ogapi.faw-kes.de is a private community service. It can see which reports your members look up, and it keeps logs for a while. If that worries you, set it to `false` and paste whole report pages instead.
- **Shared or lost phones.** The app stays signed in. If a phone is lost or shared, sign out there, or remove and re-invite that member.
- **You are responsible for your members' data** (their emails and what they post). Keep the member list small, and delete people who leave.
- **The demo page** (`/demo/`) on your site is public and shows only invented data. It cannot reach your database.

Found a security problem in the code itself? See [SECURITY.md](SECURITY.md).

---

## 🔄 Updating to a newer version

1. On your fork's GitHub page, click **Sync fork** > **Update branch**. Netlify deploys the new version by itself.
2. Check whether the update changed the database. Look in [`supabase/migrations/`](supabase/migrations/) for files with a number higher than your version. To see your version, run this in the SQL Editor:
   ```sql
   select version from public.schema_version;
   ```
3. Run each newer file once, in order, in the SQL Editor. The [migrations README](supabase/migrations/README.md) has details.

> 💡 If Sync fork reports a conflict in `public/config.js`, keep **your** values.

---

## 🌍 The public alliance page (optional)

A separate, public page to show off your alliance and recruit. It has the universe map with your planets in orange, a member leaderboard and a recruiting box. It uses only public game data and has no login. It lives in [`showcase/`](showcase/).

1. Netlify > **Add new site** > **Import an existing project** > your fork again.
2. Set **Base directory** to `showcase`, then deploy.
3. Give it its own site name. This one *is* meant to be shared.
4. Edit the words in [`showcase/site/copy.js`](showcase/site/copy.js) on GitHub. It has editing notes at the top, and it's safe to hand to a non-coder. Change any mention of the universe name there.

<!-- 📸 SCREENSHOT: 12-public-page.png -->

---

## 🩺 Troubleshooting

| Problem | Try |
|---|---|
| Deploy failed with `✋ public/config.js needs fixing` | Read the lines under it, fix `config.js`, commit. |
| Site loads, but the map or players are empty | Check `OGAME_SERVER` matches your game's address exactly. The game updates its public files hourly to weekly, so a brand-new server may be thin. |
| Can sign in but see nothing | You're not approved yet: run the approve SQL. |
| Invite email links to the wrong site | Step 5: Site URL in Supabase. |
| "Could not save..." errors after an update | A database update is waiting: see [Updating](#-updating-to-a-newer-version). |
| Alerts test does nothing | Check all five Netlify variables, redeploy, then see the Android / iPhone notes under alerts. |
| Everything stopped after a quiet week | Free Supabase projects pause when nobody uses them. Open the Supabase dashboard and click **Restore**. |

---

## 💸 Costs and limits

- The free plans of Supabase and Netlify are plenty for one alliance.
- ⏸️ **Free Supabase projects pause after about a week with no activity.** Restore them from the dashboard. Your data stays.
- 💾 Free Supabase has no automatic backups you can download. If your intel matters, export tables now and then (Table Editor > Export).
- The app fetches the game's public files through your own site and asks browsers and Netlify to keep copies for 10 minutes, so it's gentle on the game's servers. Please keep it that way.

---

## 🛠️ For developers

- **Run it locally:** `node server.js` (Node 18+, no `npm install`), then open http://localhost:3000. The demo is at http://localhost:3000/demo/.
- **How each feature works:** [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).
- **Check your settings:** `node scripts/build.mjs`.
- **Structure:** plain JavaScript in `public/`, no frameworks or build tools. The database is `supabase/setup.sql` with Row-Level Security on every table. `netlify/functions/notify.mjs` sends alerts. `showcase/` is the public page.
- **Database changes:** add a numbered file in `supabase/migrations/` *and* update `setup.sql`. The [migrations README](supabase/migrations/README.md) has the rules.

---

## 📜 License

[CC0 1.0](LICENSE): public domain. Copy, change, share and use it for anything, no credit needed.

_Not affiliated with, endorsed by or supported by Gameforge or OGame. OGame is a trademark of Gameforge. Use at your own risk: the people who wrote this can't see, recover or protect your data. That's up to you._
