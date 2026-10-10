import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('staging demo seed remains guarded and contains no production identifiers', () => {
  const seed = readFileSync(new URL('../supabase/seeds/staging_demo.sql', import.meta.url), 'utf8')
  assert.match(seed, /perfun\.seed_environment/)
  assert.match(seed, /PERFUN_STAGING_DEMO_ONLY/)
  assert.match(seed, /perfun\.demo_password/)
  assert.match(seed, /@staging\.invalid/)
  assert.doesNotMatch(seed, /fcightecxkegtqlaxvjs/i)
})
