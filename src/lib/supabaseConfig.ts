export interface SupabaseConfig {
  url: string
  publishableKey: string
}

export interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

/**
 * Resolves the public browser configuration without ever logging credential
 * values. Vite replaces these values at build time, so Cloudflare must provide
 * both variables to the production build environment.
 */
export function resolveSupabaseConfig(environment: SupabaseEnvironment): SupabaseConfig | null {
  const url = environment.VITE_SUPABASE_URL?.trim()
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  return url && publishableKey ? { url, publishableKey } : null
}
