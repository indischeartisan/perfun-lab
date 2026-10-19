import test from 'node:test'
import assert from 'node:assert/strict'
import { isReadyForShipping } from '../src/lib/operationReadiness.ts'

test('vendor shipping tab advances only for server-confirmed ready shipment', () => {
  assert.equal(isReadyForShipping(null), false)
  assert.equal(isReadyForShipping({ status: 'pending', fulfillment_allowed: false }), false)
  assert.equal(isReadyForShipping({ status: 'ready_to_ship', fulfillment_allowed: false }), false)
  assert.equal(isReadyForShipping({ status: 'shipped', fulfillment_allowed: true }), false)
  assert.equal(isReadyForShipping({ status: 'ready_to_ship', fulfillment_allowed: true }), true)
})
