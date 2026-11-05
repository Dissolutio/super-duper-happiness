// Makes the key pair that proves our notifications come from us. Run once, on your own computer:  node scripts/vapid.mjs
// PUBLIC  -> goes in public/config.js (VAPID_PUBLIC_KEY) and in the Netlify variable VAPID_PUBLIC_KEY.
// PRIVATE -> goes ONLY in the Netlify variable VAPID_PRIVATE_KEY. Never commit it, never paste it in a chat.
import crypto from 'node:crypto'
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' }), priv = privateKey.export({ format: 'jwk' })
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')])
console.log('PUBLIC  (safe to share):', raw.toString('base64url'))
console.log('PRIVATE (secret):       ', priv.d)
