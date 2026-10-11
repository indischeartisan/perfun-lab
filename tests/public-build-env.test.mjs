import test from 'node:test'
import assert from 'node:assert/strict'
import { publicBuildEnvironmentPresence, reportPublicBuildEnvironment } from '../scripts/public-build-env.mjs'

test('reports only presence of public Supabase build variables', () => {
  const values = publicBuildEnvironmentPresence({
    VITE_SUPABASE_URL: 'https://fcightecxkegtqlaxvjs.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  })

  assert.deepEqual(values, {
    VITE_SUPABASE_URL: true,
    VITE_SUPABASE_PUBLISHABLE_KEY: true,
  })
})

test('does not include a variable value in the build report', () => {
  const messages = []
  reportPublicBuildEnvironment({
    VITE_SUPABASE_URL: 'https://fcightecxkegtqlaxvjs.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_should_not_be_logged',
  }, (message) => messages.push(message))

  assert.equal(messages.length, 1)
  assert.match(messages[0], /VITE_SUPABASE_URL=true/)
  assert.match(messages[0], /VITE_SUPABASE_PUBLISHABLE_KEY=true/)
  assert.doesNotMatch(messages[0], /sb_publishable_should_not_be_logged/)
})
