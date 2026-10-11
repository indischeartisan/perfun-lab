import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseConfig } from './supabaseConfig'

const config = resolveSupabaseConfig(import.meta.env)
export const supabase = config ? createClient(config.url, config.publishableKey, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export function requireSupabase() {
  if (!supabase) throw new Error('Layanan akun belum siap pada build ini. Coba lagi setelah aplikasi diperbarui.')
  return supabase
}

export function errorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Something went wrong. Please try again.'
}
