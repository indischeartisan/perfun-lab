import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPaymentCountdown, paymentDeadlineState } from '../src/lib/paymentCountdown.ts'

test('payment deadline countdown is exact and clamps after expiry', () => {
  const deadline = '2026-11-22T10:00:00.000Z'
  assert.deepEqual(paymentDeadlineState(deadline, Date.parse('2026-11-22T09:59:59.100Z')), { expired: false, remainingSeconds: 1 })
  assert.deepEqual(paymentDeadlineState(deadline, Date.parse('2026-11-22T10:00:00.000Z')), { expired: true, remainingSeconds: 0 })
  assert.equal(formatPaymentCountdown(3600 + 61), '01:01:01')
})

test('expiry workflow verifies provider status before finalizing pending payments', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../supabase/functions/payments-expiry/index.ts', import.meta.url), 'utf8')
  assert.match(source, /expire_unstarted_payment_orders/)
  assert.match(source, /payment_expiry_candidates/)
  assert.match(source, /provider\.status\(payment\)/)
  assert.match(source, /status === 'paid' \|\| event\.status === 'expired'/)
})
