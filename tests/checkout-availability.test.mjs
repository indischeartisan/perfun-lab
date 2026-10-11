import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutErrorMessage, isShippingCheckoutEnabled, shippingUnavailable } from '../src/lib/shippingCheckout.ts'

test('shipping checkout is opt-in and remains fail-closed by default', () => {
  assert.equal(isShippingCheckoutEnabled(undefined), false)
  assert.equal(isShippingCheckoutEnabled('false'), false)
  assert.equal(isShippingCheckoutEnabled('true'), true)
})

test('legacy RPC and unavailable-shipping errors are never shown as raw database messages', () => {
  assert.equal(checkoutErrorMessage(new Error('Could not find the function public.quote_order(p_address_id, p_items) in the schema cache')), shippingUnavailable)
  assert.equal(checkoutErrorMessage({ message: 'Shipping checkout is not enabled. No order was created.' }), shippingUnavailable)
})
