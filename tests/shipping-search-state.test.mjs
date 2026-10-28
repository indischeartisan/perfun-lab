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
