import assert from 'node:assert/strict'
import test from 'node:test'
import { checkoutProductSummaries } from '../src/lib/checkoutProductSummary.ts'

const catalog = {
  noteGroups: {
    top: [{ id: 'top-note', name: 'Bergamot' }],
    middle: [{ id: 'middle-note', name: 'Jasmine' }],
    base: [{ id: 'base-note', name: 'Vetiver' }],
  },
  productOptions: [{ id: 10, label: 'Eau de Parfum 10 ml', normalPrice: 100000, openingPrice: 80000, description: '' }],
}

test('shipping-off product preview shows catalog identity, notes, quantity, and launch discount without a final total', () => {
  const [summary] = checkoutProductSummaries([{ product_id: '10ml', quantity: 2, formulas: [{ top: 'top-note', middle: 'middle-note', base: 'base-note' }] }], catalog)
  assert.equal(summary.label, 'Eau de Parfum 10 ml')
  assert.deepEqual([summary.bottleCount, summary.volumeMl, summary.quantity], [1, 10, 2])
  assert.deepEqual(summary.blends[0].notes.map(note => `${note.phase}:${note.name}`), ['Top:Bergamot', 'Middle:Jasmine', 'Base:Vetiver'])
  assert.deepEqual(summary.price, { normal: 100000, opening: 80000, discount: 20000 })
  assert.equal('lineTotal' in summary, false)
})

test('shipping-off product preview omits an unavailable price rather than inventing a total', () => {
  const [summary] = checkoutProductSummaries([{ product_id: '30ml', quantity: 1, formulas: [{ top: 'unknown-top', middle: 'unknown-middle', base: 'unknown-base' }] }], { ...catalog, productOptions: [] })
  assert.equal(summary.price, null)
  assert.deepEqual(summary.blends[0].notes.map(note => note.name), ['unknown-top', 'unknown-middle', 'unknown-base'])
})
