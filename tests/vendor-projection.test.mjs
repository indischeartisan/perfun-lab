import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVendorOrderPage, vendorProjectionError } from '../src/lib/vendorProjection.ts'

const job = { id: 'job', order_number: 'ORDER', status: 'queued', assigned_to: null, production_allowed: true, quantity: 1,
  product_snapshot: { label: 'Play Set', volume_ml: 10, bottle_count: 3 }, formulas_snapshot: [{ top: 'A', middle: null, base: 'B' }] }
const page = { rows: [{ order_number: 'ORDER', ordered_at: '2026-10-19T00:00:00Z', jobs: [job] }], has_more: false, next_cursor: null }

test('missing RPC has a clear, safe error without assuming it is an empty queue', () => {
  assert.match(vendorProjectionError({ code: 'PGRST202', message: 'internal schema cache details' }), /belum tersedia/)
  assert.doesNotMatch(vendorProjectionError({ code: 'PGRST202', message: 'internal schema cache details' }), /internal/)
  assert.equal(vendorProjectionError({ code: '42501', message: 'Access denied' }), 'Access denied')
})

test('projection contract accepts valid pages and rejects incompatible responses', () => {
  assert.equal(parseVendorOrderPage(page), page)
  assert.throws(() => parseVendorOrderPage(null), /tidak sesuai/)
  assert.throws(() => parseVendorOrderPage({ ...page, has_more: true }), /tidak sesuai/)
  assert.throws(() => parseVendorOrderPage({ ...page, rows: [{ ...page.rows[0], jobs: [{ ...job, formulas_snapshot: null }] }] }), /tidak sesuai/)
  assert.throws(() => parseVendorOrderPage({ ...page, rows: [{ ...page.rows[0], jobs: [{ ...job, status: 'unknown' }] }] }), /tidak sesuai/)
})
