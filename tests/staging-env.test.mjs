import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertStagingBuildEnvironment } from '../scripts/staging-env.mjs'

function fixture(content = '') {
  const cwd = mkdtempSync(path.join(tmpdir(), 'perfun-staging-env-'))
  if (content) writeFileSync(path.join(cwd, '.env.staging'), content)
  return cwd
}
function valid(ref = 'stagingsupabaseproj1') {
  return `VITE_DEPLOYMENT_ENV=staging\nVITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_staging\nPERFUN_PRODUCTION_SUPABASE_PROJECT_REF=productionproject001\n`
}

test('staging validator accepts an explicit isolated staging file', () => {
  const cwd = fixture(valid())
  try { assert.deepEqual(assertStagingBuildEnvironment({ cwd, env: {} }), { stagingRef: 'stagingsupabaseproj1' }) }
  finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('staging validator fails closed without explicit staging configuration', () => {
  const cwd = fixture()
  try { assert.throws(() => assertStagingBuildEnvironment({ cwd, env: {} }), /explicit .env.staging/i) }
  finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('staging validator rejects the protected production project and local production URL', () => {
  const cwd = fixture(valid('productionproject001'))
  try { assert.throws(() => assertStagingBuildEnvironment({ cwd, env: {} }), /production Supabase project/i) }
  finally { rmSync(cwd, { recursive: true, force: true }) }

  const other = fixture(valid())
  writeFileSync(path.join(other, '.env.production'), 'VITE_SUPABASE_URL=https://stagingsupabaseproj1.supabase.co\n')
  try { assert.throws(() => assertStagingBuildEnvironment({ cwd: other, env: {} }), /local production Supabase URL/i) }
  finally { rmSync(other, { recursive: true, force: true }) }
})
