import assert from 'node:assert/strict'
import test from 'node:test'
import { canSubmitReviewedOrder, shouldAutoReview } from '../src/lib/checkoutReviewState.ts'
import { orderIntentFingerprint } from '../src/lib/checkoutFingerprint.ts'

const items = [{ product_id: '10ml', quantity: 1, formulas: [{ top: 'yuzu', middle: 'matcha', base: 'amber' }] }]

test('review otomatis hanya berjalan setelah alamat dan quote ongkir valid pada shipping checkout', () => {
  assert.equal(shouldAutoReview('shipping', 'address-1', 'quote-1'), true)
  assert.equal(shouldAutoReview('paused', 'address-1', 'quote-1'), false)
  assert.equal(shouldAutoReview('shipping', '', 'quote-1'), false)
  assert.equal(shouldAutoReview('shipping', 'address-1', null), false)
})

test('buat pesanan terkunci sampai review selesai dan tidak dapat diklik ulang saat request berjalan', () => {
  assert.equal(canSubmitReviewedOrder('shipping', 'review-token', false, false), true)
  assert.equal(canSubmitReviewedOrder('shipping', undefined, false, false), false)
  assert.equal(canSubmitReviewedOrder('shipping', 'review-token', true, false), false)
  assert.equal(canSubmitReviewedOrder('shipping', 'review-token', false, true), false)
  assert.equal(canSubmitReviewedOrder('paused', 'review-token', false, false), false)
})

test('fingerprint checkout stabil saat array items dibuat ulang, tetapi berubah saat isi Bag berubah', () => {
  assert.equal(orderIntentFingerprint(items), orderIntentFingerprint(items.map(item => ({ ...item, formulas: item.formulas.map(formula => ({ ...formula })) }))))
  assert.notEqual(orderIntentFingerprint(items), orderIntentFingerprint([{ ...items[0], quantity: 2 }]))
  assert.notEqual(orderIntentFingerprint(items), orderIntentFingerprint([{ ...items[0], formulas: [{ ...items[0].formulas[0], base: 'vanilla' }] }]))
})
