// Web Push, the small version: encrypt a message for one browser and send it. No dependencies, just Node's crypto.
// RFC 8291 (message encryption, aes128gcm) and RFC 8292 (VAPID, proves the sender). Checked against the RFC's own example.
import crypto from 'node:crypto'

const dec = (s) => Buffer.from(s, 'base64url')
const enc = (b) => Buffer.from(b).toString('base64url')

// Only real push services. We POST to whatever address is stored, so never to an arbitrary one.
export const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//

// `test` lets the RFC example pin the random parts; real sends leave it empty.
export function encryptPayload(text, uaPublicB64, authB64, test = {}) {
  const uaPublic = dec(uaPublicB64), authSecret = dec(authB64)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error('bad subscription keys')
  const ecdh = crypto.createECDH('prime256v1')
  if (test.asPrivate) ecdh.setPrivateKey(dec(test.asPrivate)); else ecdh.generateKeys()
  const asPublic = ecdh.getPublicKey()
  const salt = test.salt ? dec(test.salt) : crypto.randomBytes(16)

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic])
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdh.computeSecret(uaPublic), authSecret, keyInfo, 32))
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const record = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(4096, 16)
  header[20] = 65
  return Buffer.concat([header, asPublic, record])
}

// the Authorization header that proves the message comes from the holder of our private key
export function vapidHeader(endpoint, publicB64, privateB64, subject) {
  const pub = dec(publicB64)
  const key = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: privateB64, x: enc(pub.subarray(1, 33)), y: enc(pub.subarray(33, 65)) } })
  const head = enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }))
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${head}.${claims}.${enc(sig)}, k=${publicB64}`
}

// returns the push service's HTTP status: 201 = accepted, 404/410 = this device is gone for good
export async function sendPush(sub, message, vapid, fetchImpl = fetch) {
  if (!PUSH_HOSTS.test(sub.endpoint)) throw new Error('not a push service address')
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: vapidHeader(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high',
    },
    body: encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth),
  })
  return res.status
}
