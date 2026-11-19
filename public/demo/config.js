// Settings for the DEMO page (/demo/). Loaded instead of ../config.js. Nothing here points at a real database:
// the demo answers every request itself (demo.js), and the page's security policy blocks every outside address anyway.
const OGAME_SERVER = 's999-us' // a server that does not exist
const GALAXIES = 7
const OUR_ALLIANCE = 'DONUT'
const ENEMY_ALLIANCE = 'GRIM'
const REPORT_LOOKUP = false // no third-party lookups from the demo
const SUPABASE_URL = 'https://demo.invalid' // never contacted: demo.js answers these requests
const SUPABASE_KEY = 'demo'
const VAPID_PUBLIC_KEY = '' // alerts are off in the demo
const GAME_URL = 'https://lobby.ogame.gameforge.com/'
const REPORT_PREFIX = 'us-999'
