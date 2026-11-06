import assert from 'node:assert/strict'
import test from 'node:test'
import { canSubmitReviewedOrder, shouldAutoReview } from '../src/lib/checkoutReviewState.ts'

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
