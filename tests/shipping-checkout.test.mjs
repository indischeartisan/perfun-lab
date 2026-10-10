import test from 'node:test'
import assert from 'node:assert/strict'
import { quoteExpired } from '../src/lib/shippingQuoteState.ts'

test('shipping quote expiry is fail-closed', () => {
  assert.equal(quoteExpired({ expires_at: '2026-10-10T00:00:00.000Z' }, Date.parse('2026-10-10T00:10:00.000Z')), true)
  assert.equal(quoteExpired({ expires_at: '2026-10-10T00:20:00.000Z' }, Date.parse('2026-10-10T00:10:00.000Z')), false)
  assert.equal(quoteExpired({ expires_at: 'not-a-date' }, Date.now()), true)
})
