import test from 'node:test'
import assert from 'node:assert/strict'
import { isReadyForShipping, matchesProductionAction } from '../src/lib/operationReadiness.ts'

test('vendor shipping tab advances only for server-confirmed ready shipment', () => {
  assert.equal(isReadyForShipping(null), false)
  assert.equal(isReadyForShipping({ status: 'pending', fulfillment_allowed: false }), false)
  assert.equal(isReadyForShipping({ status: 'ready_to_ship', fulfillment_allowed: false }), false)
  assert.equal(isReadyForShipping({ status: 'shipped', fulfillment_allowed: true }), false)
  assert.equal(isReadyForShipping({ status: 'ready_to_ship', fulfillment_allowed: true }), true)
})

test('a stale start returning completed cannot be reported as started', () => {
  assert.equal(matchesProductionAction('start', 'in_production'), true)
  assert.equal(matchesProductionAction('start', 'completed'), false)
  assert.equal(matchesProductionAction('complete', 'completed'), true)
  assert.equal(matchesProductionAction('complete', 'in_production'), false)
})
