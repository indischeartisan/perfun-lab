import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function parseEnv(content) {
  const result = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    result[match[1]] = value
  }
  return result
}

function readEnvFile(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
}

function projectRef(url) {
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i.exec(url ?? '')
  return match?.[1]?.toLowerCase() ?? null
}

export function assertStagingBuildEnvironment({ cwd = process.cwd(), env = process.env } = {}) {
  const stagingFile = path.join(cwd, '.env.staging')
  const staging = readEnvFile(stagingFile)
  const direct = env.PERFUN_STAGING_BUILD === '1'
  if (!existsSync(stagingFile) && !direct) {
    throw new Error('Staging build requires an explicit .env.staging file or PERFUN_STAGING_BUILD=1 in CI.')
  }

  const source = direct ? env : staging
  const url = source.VITE_SUPABASE_URL
  const key = source.VITE_SUPABASE_PUBLISHABLE_KEY
  const deployment = source.VITE_DEPLOYMENT_ENV
  const productionRef = source.PERFUN_PRODUCTION_SUPABASE_PROJECT_REF ?? env.PERFUN_PRODUCTION_SUPABASE_PROJECT_REF
  const stagingRef = projectRef(url)
  if (deployment !== 'staging') throw new Error('Staging build requires VITE_DEPLOYMENT_ENV=staging.')
  if (!stagingRef || !key || /your-project|placeholder/i.test(url) || /your_key|placeholder/i.test(key)) {
    throw new Error('Staging build requires a non-placeholder HTTPS Supabase URL and publishable key.')
  }
  if (!/^[a-z0-9]{20}$/i.test(productionRef ?? '')) {
    throw new Error('Staging build requires PERFUN_PRODUCTION_SUPABASE_PROJECT_REF for production-project protection.')
  }
  if (stagingRef === productionRef.toLowerCase()) throw new Error('Refusing staging build configured with the production Supabase project.')

  const localProduction = readEnvFile(path.join(cwd, '.env.production')).VITE_SUPABASE_URL
  if (localProduction && url === localProduction) throw new Error('Refusing staging build configured with the local production Supabase URL.')
  return { stagingRef }
}
