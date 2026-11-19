// Reads public/config.js (a browser script) in a sandbox and checks it. Used by scripts/build.mjs and server.js.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const FILE = path.join(__dirname, '..', 'public', 'config.js')
const NAMES = ['OGAME_SERVER', 'GALAXIES', 'OUR_ALLIANCE', 'ENEMY_ALLIANCE', 'REPORT_LOOKUP', 'SUPABASE_URL', 'SUPABASE_KEY', 'VAPID_PUBLIC_KEY', 'GAME_URL', 'REPORT_PREFIX']

function readConfig() {
  const src = fs.readFileSync(FILE, 'utf8')
  const ctx = {}
  vm.runInNewContext(`${src}\n;this.out = { ${NAMES.join(', ')} }`, ctx, { filename: 'public/config.js', timeout: 1000 })
  const c = ctx.out
  const problems = []
  if (!/^s\d{1,4}-[a-z]{2,3}$/.test(c.OGAME_SERVER)) problems.push(`OGAME_SERVER should look like 's265-us', not '${c.OGAME_SERVER}'`)
  if (!(Number.isInteger(c.GALAXIES) && c.GALAXIES >= 1 && c.GALAXIES <= 9)) problems.push('GALAXIES should be a whole number from 1 to 9')
  for (const k of ['OUR_ALLIANCE', 'ENEMY_ALLIANCE']) if (typeof c[k] !== 'string' || !c[k].trim() || c[k].length > 20) problems.push(`${k} should be an alliance tag`)
  if (typeof c.REPORT_LOOKUP !== 'boolean') problems.push('REPORT_LOOKUP should be true or false')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.SUPABASE_URL)) problems.push("SUPABASE_URL should look like 'https://abcdefgh.supabase.co' (no slash at the end)")
  if (typeof c.VAPID_PUBLIC_KEY !== 'string' || (c.VAPID_PUBLIC_KEY && !/^B[A-Za-z0-9_-]{80,90}$/.test(c.VAPID_PUBLIC_KEY))) problems.push("VAPID_PUBLIC_KEY should be the PUBLIC key (starts with B, about 87 characters) or ''")
  // the dangerous mistakes: a secret pasted into a public file
  if (/^sb_secret_/.test(c.SUPABASE_KEY)) problems.push('SUPABASE_KEY is a SECRET key. Remove it from config.js now, and rotate it in Supabase (Project Settings > API keys), because it may already be public.')
  if (/^eyJ/.test(c.SUPABASE_KEY)) {
    let role = ''
    try { role = JSON.parse(Buffer.from(c.SUPABASE_KEY.split('.')[1], 'base64url').toString()).role } catch { /* not a JWT */ }
    if (role !== 'anon') problems.push(`SUPABASE_KEY is a '${role || 'unknown'}' key, not the anon/publishable one. If it is service_role, remove it now and rotate it in Supabase.`)
  } else if (!/^sb_publishable_/.test(c.SUPABASE_KEY)) problems.push('SUPABASE_KEY should be the publishable key (sb_publishable_...) or the legacy anon key')
  if (/PRIVATE|secret|password/i.test(src.replace(/\/\/.*$/gm, ''))) problems.push('config.js mentions a private key, secret or password outside a comment. Secrets never go in this file.')
  return { config: c, problems }
}

module.exports = { readConfig }
