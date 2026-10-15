import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransition, createDemoOrder, initialDemoState, itemBottleTotal, makePayout, orderProduction } from '../src/simulator/store.ts'

test('demo order follows payment, assignment, production, and shipment guards', () => {
  const [pending, exception, queued, producing, ready] = initialDemoState().orders
  assert.equal(canTransition(pending, 'pay'), true)
  assert.equal(canTransition(exception, 'assign'), true)
  assert.equal(canTransition(queued, 'start'), true)
  assert.equal(canTransition(producing, 'complete'), true)
  assert.equal(canTransition(ready, 'ship'), false)
  assert.equal(canTransition({ ...ready, courier: 'JNE', service: 'REG', tracking: 'DEMO', shippingCost: 18000 }, 'ship'), true)
})

test('play set preserves three individual formula snapshots; multi-item orders wait for every job', () => {
  const order = initialDemoState().orders.find(value => value.number === 'DEMO-1026')
  assert.equal(order.items[0].formulas.length, 3)
  assert.notDeepEqual(order.items[0].formulas[0], order.items[0].formulas[1])
  assert.notDeepEqual(order.items[0].formulas[1], order.items[0].formulas[2])
  const multiItem = initialDemoState().orders.find(value => value.number === 'DEMO-1023')
  const partial = { ...multiItem, items: [{ ...multiItem.items[0], production: 'completed' }, { ...multiItem.items[1], production: 'in_production' }] }
  assert.equal(orderProduction(partial), 'in_production')
})

test('new demo orders remain synthetic and payouts include only completed work', () => {
  const state = initialDemoState()
  const item = { id: 'new', product: 'Play Set', volumeMl: 10, bottleCount: 3, quantity: 1, playSet: true, formulas: [{ top: 'Yuzu', middle: 'Matcha', base: 'Clean Musk' }, { top: 'Peony', middle: 'Tea', base: 'Amber' }, { top: 'Mint', middle: 'Jasmine', base: 'Vanilla' }], production: 'queued' }
  const next = createDemoOrder(state, { name: 'Synthetic Person', phone: '0812-0000-0000', address: 'Jl. Test No. 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40123', item })
  assert.equal(next.orders.length, state.orders.length + 1)
  assert.equal(next.orders[0].payment, 'pending')
  const completed = state.orders.find(order => order.production === 'completed')
  const payout = makePayout(state, [completed.id], 18000)
  assert.equal(payout.payouts[0].total, itemBottleTotal(completed) * 18000)
})

test('management catalog is local simulator state with the production menu coverage', () => {
  const state = initialDemoState()
  assert.deepEqual(state.catalog.notes.map(note => note.name), ['Yuzu', 'Matcha', 'Clean Musk', 'Peony'])
  assert.deepEqual(state.catalog.products.map(product => product.label), ['Eau de Parfum · 10 ml', 'Eau de Parfum · 30 ml', 'Play Set · 3 × 10 ml'])
  assert.equal(state.catalog.notes.every(note => note.active), true)
})
