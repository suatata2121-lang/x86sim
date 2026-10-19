import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { browserSessionStorage, forgetPersistentSessions } from './browserSessionStorage'

// Both values are injected at build time (see .env.example and the deploy
// workflow). The anon key is designed to be public: every table it can reach
// is protected by row-level security (supabase/schema.sql). Never put the
// service_role key here or anywhere else in this repository.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (url && anonKey) forgetPersistentSessions()

// What an email link brought in the URL hash, read before createClient():
// the client takes the recovery tokens out of the hash and then announces
// PASSWORD_RECOVERY once, which can fire before React has subscribed (#46).
// A link that expired or was already used (school mail scanners often open
// links first) comes back as #error=…&error_code=otp_expired instead.
function readEmailLink() {
  if (!url || !anonKey || typeof window === 'undefined') return { recovery: false, error: null }
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const error = params.get('error_code') ?? params.get('error')
  if (error) {
    // Read once: a reload must not show the message again.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return { recovery: params.get('type') === 'recovery', error }
}

const emailLink = readEmailLink()
/** The page was opened from a password-reset link with valid tokens. */
export const arrivedFromRecoveryLink = emailLink.recovery
/** The error code an email link came back with (e.g. otp_expired), if any. */
export const emailLinkError = emailLink.error

// When the variables are missing (a fork, or local dev without a .env.local)
// the site keeps working exactly as before, just without accounts. The
// session lasts until the browser closes (see browserSessionStorage.ts).
export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, { auth: { storage: browserSessionStorage } })
  : null

export const backendEnabled = supabase !== null
