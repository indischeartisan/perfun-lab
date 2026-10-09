import test from 'node:test'
import assert from 'node:assert/strict'
import { isOrderIntents, orderIntentsMatchCatalog, rehydratePlaySet, rehydrateSelection } from '../src/lib/storageValidation.ts'

const note = (id, layer) => ({ id, layer, name: id, category: 'test', shortDescription: '', predictionText: '', stickerColor: '#000', icon: '', profile: {} })
const groups = {
  top: [note('yuzu', 'top'), note('soapy', 'top')],
  middle: [note('matcha', 'middle'), note('soapy', 'middle')],
  base: [note('amber', 'base'), note('soapy', 'base')],
}
const mix = { top: { id: 'yuzu' }, middle: { id: 'matcha' }, base: { id: 'amber' } }

test('rehydrates a valid Play Set and skips only malformed entries', () => {
  const restored = rehydratePlaySet([mix, { top: { id: 'missing' }, middle: { id: 'matcha' }, base: { id: 'amber' } }], groups)
  assert.equal(restored?.length, 1)
  assert.equal(restored?.[0].top.id, 'yuzu')
})

test('invalid Play Set shapes and duplicate notes are rejected safely', () => {
  assert.equal(rehydratePlaySet(null, groups), null)
  assert.equal(rehydratePlaySet({}, groups), null)
  const duplicate = rehydrateSelection({ top: { id: 'soapy' }, middle: { id: 'soapy' }, base: { id: 'amber' } }, groups)
  assert.deepEqual(duplicate, { top: null, middle: null, base: null })
})

test('checkout intents require valid products, quantities, formula counts, and distinct notes', () => {
  const intentFormula = { top: 'yuzu', middle: 'matcha', base: 'amber' }
  assert.equal(isOrderIntents([{ product_id: '10ml', quantity: 1, formulas: [intentFormula] }]), true)
  assert.equal(orderIntentsMatchCatalog([{ product_id: '10ml', quantity: 1, formulas: [intentFormula] }], groups), true)
  assert.equal(orderIntentsMatchCatalog([{ product_id: '10ml', quantity: 1, formulas: [{ ...intentFormula, top: 'missing' }] }], groups), false)
  assert.equal(isOrderIntents([{ product_id: 'bundle-3x10ml', quantity: 1, formulas: [intentFormula] }]), false)
  assert.equal(isOrderIntents([{ product_id: '10ml', quantity: 0, formulas: [intentFormula] }]), false)
  assert.equal(isOrderIntents([{ product_id: '10ml', quantity: 1, formulas: [{ top: 'yuzu', middle: 'yuzu', base: 'amber' }] }]), false)
})
