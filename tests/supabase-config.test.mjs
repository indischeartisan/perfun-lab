import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSupabaseConfig } from '../src/lib/supabaseConfig.ts'

test('uses the documented Vite publishable key variable', () => {
  const config = resolveSupabaseConfig({
    VITE_SUPABASE_URL: ' https://fcightecxkegtqlaxvjs.supabase.co ',
    VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test_key ',
  })

  assert.deepEqual(config, {
    url: 'https://fcightecxkegtqlaxvjs.supabase.co',
    publishableKey: 'sb_publishable_test_key',
  })
})

test('fails closed when either required public build variable is absent', () => {
  assert.equal(resolveSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co' }), null)
  assert.equal(resolveSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key' }), null)
  assert.equal(resolveSupabaseConfig({}), null)
})
