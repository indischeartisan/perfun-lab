import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceOrder, courierForProvince, initialState, serviceForCourier, shipOrder, STORAGE_KEY, validShipment } from '../vendor-simulator/src/store.ts'

test('isolated vendor dataset has six orders, size variants and independent play-set formulas', () => {
  const state = initialState()
  assert.equal(state.orders.length, 6)
  assert.notEqual(STORAGE_KEY, 'perfun-lab:operations-simulator:v1.1')
  assert.deepEqual(new Set(state.orders.map(order => order.stage)), new Set(['order', 'production', 'ship', 'done']))
  assert.ok(state.orders.some(order => order.items.some(item => item.volume === 30)))
  assert.ok(state.orders.some(order => order.items.length > 1))
  const play = state.orders.flatMap(order => order.items).find(item => item.playSet)
  assert.equal(play.formulas.length, 3)
  assert.notDeepEqual(play.formulas[0], play.formulas[1])
  assert.notDeepEqual(play.formulas[1], play.formulas[2])
})

test('vendor order transitions only forward and validates simulated shipping', () => {
  let state = initialState()
  const id = state.orders[0].id
  state = advanceOrder(state, id, 'order')
  assert.equal(state.orders[0].stage, 'production')
  state = advanceOrder(state, id, 'production')
  assert.equal(state.orders[0].stage, 'ship')
  const order = state.orders[0]
  const courier = courierForProvince(order.province)
  const shipment = { courier, service: serviceForCourier(courier), tracking: 'DEMO-RESI', cost: 15000 }
  assert.equal(validShipment(order, { ...shipment, tracking: ' ' }), false)
  assert.equal(validShipment(order, { ...shipment, courier: 'Anteraja' }), false)
  assert.equal(shipOrder(state, id, shipment).orders[0].stage, 'done')
  assert.equal(shipOrder(state, id, { ...shipment, cost: 0 }).orders[0].stage, 'ship')
})

test('courier selection uses structured province, including outside Java', () => {
  for (const province of ['Banten', 'DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur']) assert.equal(courierForProvince(province), 'J&T')
  assert.equal(courierForProvince('Bali'), 'Anteraja')
  assert.equal(courierForProvince('Sulawesi Selatan'), 'Anteraja')
})
