import test from 'node:test'
import assert from 'node:assert/strict'
import { quoteExpired } from '../src/lib/shippingQuoteState.ts'
import { reviewedShippingBreakdown } from '../src/lib/shippingCheckoutReview.ts'

test('shipping quote expiry is fail-closed', () => {
  assert.equal(quoteExpired({ expires_at: '2026-10-10T00:00:00.000Z' }, Date.parse('2026-10-10T00:10:00.000Z')), true)
  assert.equal(quoteExpired({ expires_at: '2026-10-10T00:20:00.000Z' }, Date.parse('2026-10-10T00:10:00.000Z')), false)
  assert.equal(quoteExpired({ expires_at: 'not-a-date' }, Date.now()), true)
})

test('checkout review only renders a complete backend shipping breakdown', () => {
  const snapshot = { quote_id: 'quote', courier_code: 'jnt', courier_name: 'J&T Express', service: 'EZ', amount: 13000, original_shipping_amount: 18000, shipping_discount: 5000, customer_shipping_total: 13000, promotion_subsidy: 5000, etd: '1-2 days', expires_at: '2026-10-30T00:00:00.000Z' }
  const freeShippingSnapshot = { ...snapshot, amount: 0, original_shipping_amount: 4000, shipping_discount: 4000, customer_shipping_total: 0, promotion_subsidy: 4000 }

  assert.deepEqual(reviewedShippingBreakdown({ shipping: 13000, shipping_quote_snapshot: snapshot }), snapshot)
  assert.deepEqual(reviewedShippingBreakdown({ shipping: 0, shipping_quote_snapshot: freeShippingSnapshot }), freeShippingSnapshot)
  assert.equal(reviewedShippingBreakdown({ shipping: 13000, shipping_quote_snapshot: { ...snapshot, shipping_discount: 18001 } }), null)
  assert.equal(reviewedShippingBreakdown({ shipping: 13000, shipping_quote_snapshot: { ...snapshot, customer_shipping_total: 14000 } }), null)
  assert.equal(reviewedShippingBreakdown({ shipping: 13000, shipping_quote_snapshot: { ...snapshot, shipping_discount: -1 } }), null)
  assert.equal(reviewedShippingBreakdown({ shipping: 13000, shipping_quote_snapshot: { ...snapshot, shipping_discount: 5000.5 } }), null)
  assert.equal(reviewedShippingBreakdown({ shipping: 13000, shipping_quote_snapshot: { ...snapshot, original_shipping_amount: undefined } }), null)
  assert.equal(reviewedShippingBreakdown({ shipping: 13000, shipping_quote_snapshot: { ...snapshot, customer_shipping_total: '13000' } }), null)
})
