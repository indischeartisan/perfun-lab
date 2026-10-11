export function publicBuildEnvironmentPresence(environment: Record<string, string | undefined>): {
  VITE_SUPABASE_URL: boolean
  VITE_SUPABASE_PUBLISHABLE_KEY: boolean
}

export function reportPublicBuildEnvironment(
  environment: Record<string, string | undefined>,
  output?: (message: string) => void,
): {
  VITE_SUPABASE_URL: boolean
  VITE_SUPABASE_PUBLISHABLE_KEY: boolean
}
