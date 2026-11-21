import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAllVendorCache, getVendorCached } from '../src/lib/vendorCache.ts'

test('vendor cache deduplicates identical in-flight requests and isolates accounts', async () => {
  clearAllVendorCache()
  let calls = 0
  let release
  const pending = new Promise(resolve => { release = resolve })
  const load = async () => { calls += 1; await pending; return { account: 'alice' } }
  const first = getVendorCached('alice', 'production:queued:0', load)
  const second = getVendorCached('alice', 'production:queued:0', load)
  const other = getVendorCached('bob', 'production:queued:0', async () => { calls += 1; return { account: 'bob' } })
  assert.strictEqual(first, second)
  release()
  assert.deepEqual(await first, { account: 'alice' })
  assert.deepEqual(await other, { account: 'bob' })
  assert.equal(calls, 2)
  assert.deepEqual(await getVendorCached('alice', 'production:queued:0', async () => { throw new Error('cache miss') }), { account: 'alice' })
})

test('vendor cache keeps old data until a forced refresh succeeds', async () => {
  clearAllVendorCache()
  let value = 1
  assert.equal(await getVendorCached('alice', 'shipping:ready_to_ship:0', async () => value), 1)
  value = 2
  await assert.rejects(getVendorCached('alice', 'shipping:ready_to_ship:0', async () => { throw new Error('temporary') }, { force: true }), /temporary/)
  assert.equal(await getVendorCached('alice', 'shipping:ready_to_ship:0', async () => value), 1)
  assert.equal(await getVendorCached('alice', 'shipping:ready_to_ship:0', async () => value, { force: true }), 2)
})
