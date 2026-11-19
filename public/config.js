// ⚙️  YOUR WAR ROOM'S SETTINGS. This is the ONLY file a new alliance needs to edit.
// Everything here is PUBLIC: anyone who opens your site can read it. That is fine for these values.
// 🚫 NEVER put the Supabase secret / service_role key, the database password or the VAPID PRIVATE key here,
//    or anywhere in the repo. Those go only in Netlify > Site configuration > Environment variables.
// After editing, Netlify rebuilds the site; `node scripts/build.mjs` checks this file and generates the proxy rules.

// 🎮 Your game server: the start of your game's web address. https://s265-us.ogame.gameforge.com -> 's265-us'
const OGAME_SERVER = 's265-us'
const GALAXIES = 7 // how many galaxies your universe has (the galaxy view goes up to this number)

// 🛡️  Alliance tags, exactly as in the game. Your own first, then the alliance you are at war with.
const OUR_ALLIANCE = 'DONUT'
const ENEMY_ALLIANCE = 'PMA'

// 🔎 Report lookup by ID: the short sr-.../cr-... report ids are looked up at a third-party service
// (ogapi.faw-kes.de), which sees every id your members paste. false = members can only paste whole report pages.
const REPORT_LOOKUP = true

// 🗄️  Supabase (Project Settings > API): the project URL and the PUBLISHABLE key (sb_publishable_..., or the legacy anon key).
// The publishable key can only do what Row-Level Security allows, so it is safe here.
const SUPABASE_URL = 'https://wcihwuagdrbdohiyrfei.supabase.co'
const SUPABASE_KEY = 'sb_publishable_GUmqeu_1KZrIInpIfRPwRA_I1lWLf6y'

// 🔔 Notifications: the PUBLIC half of the push key pair (from `node scripts/vapid.mjs`). Empty '' = alerts are off.
const VAPID_PUBLIC_KEY = 'BLBG5h5cHgjED86YBwk9AwD-rxp5UPdM0cYDIRCcLpX7tgDkKPV9uL8VgczsoASZwArhsYKceNn8113i9YtN4T8'

// ---- worked out from the settings above (no need to edit) ----
const GAME_URL = `https://${OGAME_SERVER}.ogame.gameforge.com/game/index.php`
// report ids look like sr-us-265-<40 hex>: community and server number come from OGAME_SERVER ('s265-us' -> 'us-265')
const REPORT_PREFIX = OGAME_SERVER.replace(/^s(\d+)-([a-z]+)$/, '$2-$1')
