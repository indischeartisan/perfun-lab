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

test('expiry rollout deploys all payment functions before the scheduler migration', async () => {
  const fs = await import('node:fs/promises')
  const rollout = await fs.readFile(new URL('../docs/payment-expiry-rollout.md', import.meta.url), 'utf8')
  const migration = await fs.readFile(new URL('../supabase/migrations/20261122120000_payment_expiry_scheduler.sql', import.meta.url), 'utf8')
  for (const functionName of ['payments-create', 'payments-webhook', 'payments-sync', 'payments-expiry']) assert.match(rollout, new RegExp(functionName))
  assert.ok(rollout.indexOf('Apply `20261122120000_payment_expiry_scheduler.sql`') < rollout.indexOf('Deploy `payments-create`'))
  assert.ok(rollout.indexOf('Deploy `payments-create`') < rollout.indexOf('enable_payment_expiry_scheduler'))
  assert.ok(migration.indexOf('create extension if not exists pg_cron') < migration.indexOf('enable_payment_expiry_scheduler'))
  assert.match(migration, /payment_expiry_legacy_audit/)
  assert.match(migration, /parse_doku_expiry/)
  assert.match(migration, /provider_expiry_at/)
  assert.match(migration, /where o\.status='pending_payment' and o\.payment_status not in \('paid','refunded'\)/)
  assert.match(migration, /Legacy payment expiry audit is incomplete/)
  const beforeActivation = migration.slice(0, migration.indexOf('create or replace function public.enable_payment_expiry_scheduler'))
  assert.doesNotMatch(beforeActivation, /perform cron\.schedule\('perfun-payment-expiry-every-minute'/)
  const reserve = migration.slice(migration.indexOf('create or replace function public.reserve_payment'), migration.indexOf('create or replace function public.attach_payment_session'))
  assert.doesNotMatch(reserve, /payment_due_date/)
})
