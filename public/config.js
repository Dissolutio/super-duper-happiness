// Public values, safe to commit: the publishable key can only do what Row-Level Security allows.
// NEVER put the secret / service_role key or the database password in this repo.
const SUPABASE_URL = 'https://wcihwuagdrbdohiyrfei.supabase.co'
const SUPABASE_KEY = 'sb_publishable_GUmqeu_1KZrIInpIfRPwRA_I1lWLf6y'

// Notifications: the PUBLIC half of the push key pair (from `node scripts/vapid.mjs`). Empty = alerts are off.
// The private half lives only in the Netlify settings.
const VAPID_PUBLIC_KEY = 'BLBG5h5cHgjED86YBwk9AwD-rxp5UPdM0cYDIRCcLpX7tgDkKPV9uL8VgczsoASZwArhsYKceNn8113i9YtN4T8'
