import test from 'node:test'
import assert from 'node:assert/strict'
import { canSaveShippingAddress, createShippingQuoteOwnerGate, hasVerifiedShippingDestination, shippingDestinationState } from '../src/lib/shippingAddressState.ts'

test('editor opened before shipping readiness cannot save an unverified address when shipping becomes enabled', () => {
  const verified = { city: 'Bandung', province: 'Jawa Barat', postal_code: '40000', district: '', rajaongkir_destination_id: 12, rajaongkir_destination_label: { name: 'Lokasi', city: 'Bandung', province: 'Jawa Barat', postal_code: '40000' }, rajaongkir_destination_verified_at: '2026-11-01T00:00:00Z' }
  assert.equal(canSaveShippingAddress(false, null, false, false), true)
  assert.equal(canSaveShippingAddress(true, null, false, false), false)
  assert.equal(canSaveShippingAddress(true, null, true, false), true)
  assert.equal(canSaveShippingAddress(true, verified, false, false), true)
  assert.equal(canSaveShippingAddress(true, verified, false, true), false)
  assert.equal(canSaveShippingAddress(true, { ...verified, rajaongkir_destination_verified_at: null }, false, false), false)
})

test('only a verified destination with complete canonical location is bound', () => {
  const label = { name: 'Lokasi resmi', city: 'Bandung', province: 'Jawa Barat', postal_code: '40000' }
  const address = { city: 'Bandung', province: 'Jawa Barat', district: '', postal_code: '40000', rajaongkir_destination_id: 12, rajaongkir_destination_label: label, rajaongkir_destination_verified_at: '2026-11-01T00:00:00Z' }
  assert.equal(hasVerifiedShippingDestination(address), true)
  assert.equal(hasVerifiedShippingDestination({ ...address, rajaongkir_destination_verified_at: null }), false)
  assert.equal(hasVerifiedShippingDestination({ ...address, rajaongkir_destination_label: {} }), false)
  for (const key of ['name', 'city', 'province', 'postal_code']) {
    assert.equal(hasVerifiedShippingDestination({ ...address, rajaongkir_destination_label: { ...label, [key]: '' } }), false)
  }
  assert.equal(hasVerifiedShippingDestination({ ...address, rajaongkir_destination_id: 0 }), false)
  assert.equal(hasVerifiedShippingDestination(null), false)
})

test('shipping destination must match every stored region field before use', () => {
  const label = { name: 'Lokasi', city: 'Bandung', province: 'Jawa Barat', district: 'Cimenyan', subdistrict: 'Mekar', postal_code: '40000' }
  const address = { city: ' bandung ', province: 'JAWA BARAT', district: 'MEKAR, cimenyan', postal_code: '40000', rajaongkir_destination_id: 12, rajaongkir_destination_label: label, rajaongkir_destination_verified_at: '2026-11-01T00:00:00Z' }
  assert.equal(shippingDestinationState(address), 'valid')
  for (const key of ['city', 'province', 'district', 'postal_code']) {
    const changed = { ...address, [key]: 'berbeda' }
    assert.equal(shippingDestinationState(changed), 'inconsistent', key)
    assert.equal(canSaveShippingAddress(true, changed, false, false), false, key)
    assert.equal(canSaveShippingAddress(true, changed, true, false), true, key)
  }
  assert.equal(shippingDestinationState({ ...address, district: 'Cimenyan', rajaongkir_destination_label: { ...label, subdistrict: undefined } }), 'valid', 'legacy district-only label')
  assert.equal(shippingDestinationState({ ...address, district: 'Mekar', rajaongkir_destination_label: { ...label, district: 'mekar' } }), 'valid', 'duplicate district and subdistrict')
  assert.equal(shippingDestinationState({ ...address, rajaongkir_destination_id: null }), 'missing')
})

test('a deferred quote from a previously selected address is ignored', async () => {
  const gate = createShippingQuoteOwnerGate('item-a')
  const oldRevision = gate.nextAddress()
  let resolve
  const deferred = new Promise(done => { resolve = done })
  let accepted = null
  const result = deferred.then(value => { if (gate.accepts(oldRevision, 'item-a')) accepted = value })
  gate.nextAddress()
  resolve('old-quote')
  await result
  assert.equal(accepted, null)
  assert.equal(gate.accepts(oldRevision + 1, 'item-a'), true)
})

test('a deferred quote from old items is ignored after an items change', async () => {
  const gate = createShippingQuoteOwnerGate('item-a')
  const revision = gate.nextAddress()
  let resolve
  const deferred = new Promise(done => { resolve = done })
  let accepted = null
  const result = deferred.then(value => { if (gate.accepts(revision, 'item-a')) accepted = value })
  const newRevision = gate.updateItems('item-b')
  resolve('old-quote')
  await result
  assert.equal(accepted, null)
  assert.equal(gate.accepts(newRevision, 'item-b'), true)
  assert.equal(gate.updateItems('item-b'), null)
  gate.updateItems('item-a')
  assert.equal(gate.accepts(revision, 'item-a'), false)
})
