import test from 'node:test'
import assert from 'node:assert/strict'
import { createShippingSearchRequestGate } from '../src/lib/shippingSearchState.ts'

test('a newer destination search invalidates an older response', () => {
 const gate = createShippingSearchRequestGate()
 const older = gate.begin()
 const newer = gate.begin()
 assert.equal(gate.isCurrent(older), false)
 assert.equal(gate.isCurrent(newer), true)
})

test('invalidating a destination search rejects its pending response', () => {
 const gate = createShippingSearchRequestGate()
 const request = gate.begin()
 gate.invalidate()
 assert.equal(gate.isCurrent(request), false)
})

test('a revision transition clears loading before an older request settles', () => {
  const gate = createShippingSearchRequestGate()
  const older = gate.begin()
  assert.equal(gate.start(older), true)
  assert.equal(gate.isLoading(), true)

  const newer = gate.begin()
  assert.equal(gate.isLoading(), false)
  assert.equal(gate.settle(older), false)
  assert.equal(gate.isLoading(), false)
  assert.equal(gate.start(newer), true)
  assert.equal(gate.settle(newer), true)
  assert.equal(gate.isLoading(), false)
})

test('invalidating a loading request clears busy state', () => {
  const gate = createShippingSearchRequestGate()
  const request = gate.begin()
  gate.start(request)
  gate.invalidate()
  assert.equal(gate.isLoading(), false)
  assert.equal(gate.settle(request), false)
})
