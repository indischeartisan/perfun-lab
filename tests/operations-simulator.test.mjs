import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransition, createDemoOrder, initialDemoState, isPackingComplete, itemBottleTotal, makePayout } from '../src/simulator/store.ts'

test('demo order follows payment, assignment, production, packing, and shipment guards', () => {
  const [pending, assignable, queued, producing, ready, packed] = initialDemoState().orders
  assert.equal(canTransition(pending, 'pay'), true)
  assert.equal(canTransition(pending, 'assign'), false)
  assert.equal(canTransition(assignable, 'assign'), true)
  assert.equal(canTransition(queued, 'start'), true)
  assert.equal(canTransition(producing, 'complete'), true)
  assert.equal(canTransition(ready, 'pack'), false)
  assert.equal(canTransition({ ...ready, packing: { bottle: true, label: true, seal: true } }, 'pack'), true)
  assert.equal(isPackingComplete(packed), true)
  assert.equal(canTransition(packed, 'ship'), true)
})

test('new demo orders are always pending and do not alter existing records', () => {
  const state = initialDemoState()
  const next = createDemoOrder(state, { name: 'Synthetic Person', phone: '0812-0000-0000', address: 'Jl. Test No. 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40123', item: { id: 'new', product: 'Play Set', volumeMl: 10, bottleCount: 3, quantity: 2, playSet: true, formula: { top: 'Yuzu', middle: 'Matcha', base: 'Clean Musk' } } })
  assert.equal(next.orders.length, state.orders.length + 1)
  assert.equal(next.orders[0].payment, 'pending')
  assert.equal(next.orders[0].production, 'unassigned')
  assert.equal(next.orders[0].items[0].bottleCount, 3)
  assert.equal(itemBottleTotal(next.orders[0]), 6)
})

test('payouts only include completed assigned jobs and use the explicit demo rate', () => {
  const state = initialDemoState()
  const completed = state.orders.find(order => order.production === 'completed')
  const pending = state.orders.find(order => order.production !== 'completed')
  const next = makePayout(state, [completed.id, pending.id], 18000)
  assert.equal(next.payouts.length, 1)
  assert.deepEqual(next.payouts[0].orderIds, [completed.id])
  assert.equal(next.payouts[0].total, itemBottleTotal(completed) * 18000)
})
