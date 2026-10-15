import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { browserSessionStorage, forgetPersistentSessions } from './browserSessionStorage'

// Both values are injected at build time (see .env.example and the deploy
// workflow). The anon key is designed to be public: every table it can reach
// is protected by row-level security (supabase/schema.sql). Never put the
// service_role key here or anywhere else in this repository.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (url && anonKey) forgetPersistentSessions()

// When the variables are missing (a fork, or local dev without a .env.local)
// the site keeps working exactly as before, just without accounts. The
// session lasts until the browser closes (see browserSessionStorage.ts).
export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, { auth: { storage: browserSessionStorage } })
  : null

export const backendEnabled = supabase !== null
