import test from 'node:test'
import assert from 'node:assert/strict'
import { formatOrderCopy, formatShippingAddress, labelPrintHtml, packingSlipPrintHtml } from '../src/lib/fulfillmentDocuments.ts'

const shipment = {
  id: 'shipment-1', order_id: 'order-1', order_number: 'PF-TEST-01', ordered_at: '2026-10-12T00:00:00Z', created_at: '', updated_at: '', status: 'ready_to_ship', courier: 'JNE', service: 'REG', tracking_number: '', shipped_at: null, delivered_at: null, fulfillment_allowed: true, shipping_cost: 0, provider: 'manual', provider_reference: null,
  address_snapshot: { recipient_name: 'Ayu Test', phone: '081234567890', address_line: 'Jl. Melati 1', district: 'Tigaraksa', city: 'Tangerang', province: 'Banten', postal_code: '15720', delivery_note: 'Call before delivery' },
  items_snapshot: [{ product: { label: 'Play Set', bottle_count: 3, volume_ml: 10 }, quantity: 2 }], packing_status: 'packed', packing_checklist: { bottles_checked: true, formula_stickers_checked: true, bottles_sealed: true, packaging_ready: true, recipient_label_checked: true }, packed_at: null, packed_by: null, actual_shipping_cost: null, shipping_payer: null, actual_shipping_entered_at: null, actual_shipping_entered_by: null, customer_shipping: null, shipping_override_history: [],
}
const jobs = [{ id: 'job-1', order_number: 'PF-TEST-01', quantity: 2, product_snapshot: { label: 'Play Set', bottle_count: 3, volume_ml: 10 }, formulas_snapshot: [{ top: 'Bergamot', middle: 'Jasmine', base: 'Musk' }, { top: 'Tea', middle: 'Rose', base: 'Amber' }, { top: 'Pear', middle: 'Iris', base: 'Cedar' }] }]

test('copy formats use immutable shipping and formula snapshots', () => {
  assert.match(formatShippingAddress(shipment), /Ayu Test\n081234567890\nJl\. Melati 1/)
  const order = formatOrderCopy(shipment, jobs)
  assert.match(order, /Bottle 1: Top Bergamot · Middle Jasmine · Base Musk/)
  assert.match(order, /Bottle 2: Top Tea · Middle Rose · Base Amber/)
  assert.match(order, /Bottle 3: Top Pear · Middle Iris · Base Cedar/)
  assert.match(order, /Delivery instruction: Call before delivery/)
  assert.doesNotMatch(order, /Rp|payment|grand total/i)
})

test('mixed item sizes retain their individual quantities and snapshots', () => {
  const small = { product: { label: '10 ml', bottle_count: 1, volume_ml: 10 }, quantity: 2 }
  const large = { product: { label: '30 ml', bottle_count: 1, volume_ml: 30 }, quantity: 1 }
  const mixed = { ...shipment, items_snapshot: [small, large] }
  const mixedJobs = [
    { ...jobs[0], id: 'small', product_snapshot: small.product, quantity: 2, formulas_snapshot: [jobs[0].formulas_snapshot[0]] },
    { ...jobs[0], id: 'large', product_snapshot: large.product, quantity: 1, formulas_snapshot: [jobs[0].formulas_snapshot[1]] },
  ]
  const slip = packingSlipPrintHtml(mixed, mixedJobs)
  assert.match(slip, /1 × 10 ml · Quantity: 2/)
  assert.match(slip, /1 × 30 ml · Quantity: 1/)
  assert.match(slip, /Top Bergamot/)
  assert.match(slip, /Top Tea/)
})

test('print documents contain operational fields but exclude commercial fields', () => {
  const label = labelPrintHtml(shipment)
  const slip = packingSlipPrintHtml(shipment, jobs)
  assert.match(label, /@page\{size:A6 portrait/)
  assert.match(label, /Tracking number pending/)
  assert.match(slip, /Top Bergamot/)
  assert.doesNotMatch(`${label}${slip}`, /shipping_cost|actual_shipping_cost|grand_total|payment/i)
})

test('empty formula snapshots remain explicit and printable', () => {
  assert.match(formatOrderCopy(shipment, []), /Formula snapshot unavailable/)
  assert.match(packingSlipPrintHtml(shipment, []), /Formula snapshot unavailable/)
})
