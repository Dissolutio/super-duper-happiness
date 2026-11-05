// Sends push notifications. The app calls this right after someone adds a landing or posts a message with an @mention.
//
// Safety rules:
//  * The caller proves who they are with their own login token; Supabase checks it. Only approved members count.
//  * The caller never says WHAT to send. We look up their newest landing/message (made in the last 2 minutes) in the database
//    and build the text from that, so nobody can push arbitrary text. Each landing/message notifies once (push_log).
//  * Addresses we send to must be real push services (netlify/lib/push.mjs).
// Settings (Netlify > Site configuration > Environment variables): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY. The two secret ones must never appear in the repo or a chat.
import { sendPush } from '../lib/push.mjs'

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
const RECENT_MS = 2 * 60 * 1000
const MISSIONS = { attack: 'attack', acs_attack: 'ACS attack', acs_defend: 'ACS defend', transport: 'transport', deploy: 'deploy', espionage: 'espionage', harvest: 'harvest', expedition: 'expedition', moon_destruction: 'moon destruction', colonize: 'colonize' }
const CATS = { alert: 'ALERT', opportunity: 'Opportunity', info: 'Info' }

function lands(arrivesAt) {
  const min = Math.round((new Date(arrivesAt) - Date.now()) / 60000)
  if (min <= 0) return 'landing now'
  return min < 60 ? `lands in ${min}m` : `lands in ${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  const { SUPABASE_URL: SB, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!SB || !PUB || !SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json(500, { error: 'Notifications are not set up on the server yet.' })
  const vapid = { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: process.env.URL || 'https://example.com' }

  let type
  try { type = (await req.json()).type } catch { return json(400, { error: 'bad request' }) }
  if (!['landing', 'message', 'test'].includes(type)) return json(400, { error: 'unknown type' })

  // who is asking? Supabase checks their token.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const who = token && (await fetch(`${SB}/auth/v1/user`, { headers: { apikey: PUB, Authorization: `Bearer ${token}` } }))
  if (!who?.ok) return json(401, { error: 'not logged in' })
  const user = await who.json()

  // database access with the secret key (a legacy service_role key is a JWT and also wants an Authorization header)
  const dbHeaders = { apikey: SECRET, 'Content-Type': 'application/json', ...(SECRET.startsWith('eyJ') ? { Authorization: `Bearer ${SECRET}` } : {}) }
  const db = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...dbHeaders, ...init.headers } })
  const rows = async (path) => { const r = await db(path); if (!r.ok) throw new Error(`database ${r.status}`); return r.json() }

  try {
    const [me] = await rows(`profiles?id=eq.${user.id}&select=approved,display_name`)
    if (!me?.approved) return json(403, { error: 'not approved' })

    let recipients, message
    const subs = 'id,user_id,endpoint,p256dh,auth,profiles!inner(approved,display_name)'
    const approved = 'profiles.approved=eq.true'

    if (type === 'test') {
      recipients = await rows(`push_subscriptions?select=${subs}&user_id=eq.${user.id}&${approved}`)
      message = { title: 'Notifications work', body: 'You will get alerts like this on this device.', tag: 'test' }
    } else {
      const since = new Date(Date.now() - RECENT_MS).toISOString()
      const table = type === 'landing' ? 'landings' : 'messages'
      const cols = type === 'landing' ? 'id,side,mission,category,galaxy,system,position,strength,arrives_at' : 'id,channel,body'
      const [item] = await rows(`${table}?author=eq.${user.id}&created_at=gte.${since}&order=created_at.desc&limit=1&select=${cols}`)
      if (!item) return json(200, { sent: 0, note: 'nothing recent to announce' })

      // claim it; if someone already did, stop (this is what makes a repeated call harmless)
      const claim = await db('push_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind: type, ref_id: item.id }) })
      if (claim.status === 409) return json(200, { sent: 0, note: 'already announced' })
      if (!claim.ok) throw new Error(`log ${claim.status}`)

      if (type === 'landing') {
        // enemy flights that need no action (category info) stay quiet; our own moves still follow the "our attacks and fleet moves" setting
        if (item.side === 'theirs' && item.category === 'info') return json(200, { sent: 0, note: 'info only' })
        const flag = item.side === 'theirs' ? 'on_enemy' : 'on_ours'
        recipients = await rows(`push_subscriptions?select=${subs}&user_id=neq.${user.id}&${flag}=eq.true&${approved}`)
        const what = `${item.side === 'theirs' ? 'Enemy' : 'Our'} ${MISSIONS[item.mission] ?? 'fleet'}`
        message = { title: item.side === 'theirs' ? `${CATS[item.category] ?? 'Landing'}: ${what}` : what, body: `[${item.galaxy}:${item.system}:${item.position}] · ${item.strength} · ${lands(item.arrives_at)}`, tag: `landing-${item.id}` }
      } else {
        const named = new Set([...item.body.matchAll(/@([\w.-]{2,32})/g)].map((m) => m[1].toLowerCase()))
        if (!named.size) return json(200, { sent: 0, note: 'no mentions' })
        const all = await rows(`push_subscriptions?select=${subs}&user_id=neq.${user.id}&on_mention=eq.true&${approved}`)
        recipients = all.filter((s) => named.has(String(s.profiles.display_name ?? '').toLowerCase()))
        message = { title: `${me.display_name} mentioned you`, body: `#${item.channel}: ${item.body.slice(0, 120)}`, tag: `message-${item.id}` }
      }
    }

    // send to every device; devices the push service says are gone get forgotten
    const results = await Promise.allSettled(recipients.map(async (s) => ({ id: s.id, status: await sendPush(s, { ...message, url: '/' }, vapid) })))
    const gone = results.filter((r) => r.status === 'fulfilled' && [404, 410].includes(r.value.status)).map((r) => r.value.id)
    if (gone.length) await db(`push_subscriptions?id=in.(${gone.join(',')})`, { method: 'DELETE' })
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300).length
    return json(200, { sent, devices: recipients.length })
  } catch (e) {
    console.error('notify failed:', e.message) // message only: never log tokens, keys or subscription details
    return json(500, { error: 'could not send notifications' })
  }
}
