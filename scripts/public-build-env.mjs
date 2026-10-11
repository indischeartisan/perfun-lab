const requiredPublicBuildVariables = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
]

export function publicBuildEnvironmentPresence(environment) {
  return Object.fromEntries(requiredPublicBuildVariables.map((name) => [name, Boolean(environment[name]?.trim())]))
}

export function reportPublicBuildEnvironment(environment, output = console.info) {
  const presence = publicBuildEnvironmentPresence(environment)
  output(`[perfun build] VITE_SUPABASE_URL=${presence.VITE_SUPABASE_URL} VITE_SUPABASE_PUBLISHABLE_KEY=${presence.VITE_SUPABASE_PUBLISHABLE_KEY}`)
  return presence
}
