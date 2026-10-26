import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPagedSnapshots } from '../src/lib/pagedSnapshots.ts'
import { parseActualShippingCost, validateDispatchDetails } from '../src/lib/shippingValidation.ts'
import { confirmedPackingChecklist } from '../src/lib/packingConfirmation.ts'

test('formula snapshots span pages, even if the server caps each page', async () => {
  const rows = Array.from({ length: 27 }, (_, id) => ({ id: String(id) }))
  const collected = await collectPagedSnapshots(async (from, to) => ({ rows: rows.slice(from, Math.min(to + 1, from + 7)), count: rows.length }), 10)
  assert.deepEqual(collected, rows)
})

test('snapshot reads fail closed on concurrent changes, missing pages and duplicates', async () => {
  await assert.rejects(collectPagedSnapshots(async from => from ? { rows: [{ id: 'b' }], count: 3 } : { rows: [{ id: 'a' }], count: 2 }), /changed/)
  await assert.rejects(collectPagedSnapshots(async () => ({ rows: [], count: 1 })), /incomplete/)
  await assert.rejects(collectPagedSnapshots(async () => ({ rows: [{ id: 'a' }, { id: 'a' }], count: 2 })), /changed/)
  await assert.rejects(collectPagedSnapshots(async () => ({ rows: [], count: null })), /verified/)
  assert.deepEqual(await collectPagedSnapshots(async () => ({ rows: [], count: 0 })), [])
})

test('shipping validation rejects whitespace, control characters and missing cost without inventing service policy', () => {
  const valid = { courier: 'J&T', service: 'REG', tracking_number: 'TEST123' }
  assert.equal(validateDispatchDetails(valid), null)
  assert.match(validateDispatchDetails({ ...valid, courier: '  ' }), /required/)
  assert.match(validateDispatchDetails({ ...valid, service: 'REG\n' }), /invalid/)
  assert.match(validateDispatchDetails({ ...valid, tracking_number: '' }), /required/)
  assert.equal(parseActualShippingCost(''), null)
  assert.equal(parseActualShippingCost('0'), 0)
  assert.equal(parseActualShippingCost('12500'), 12500)
  assert.equal(parseActualShippingCost('-1'), null)
  assert.equal(parseActualShippingCost('1.5'), null)
  assert.equal(parseActualShippingCost('9007199254740992'), null)
})

test('packing checklist is created only after an explicit affirmative confirmation', () => {
  assert.equal(confirmedPackingChecklist(false), null)
  assert.deepEqual(confirmedPackingChecklist(true), { bottles_checked: true, formula_stickers_checked: true, bottles_sealed: true, packaging_ready: true, recipient_label_checked: true })
})
