import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPagedSnapshots } from '../src/lib/pagedSnapshots.ts'
import { parseActualShippingCost, validateDispatchDetails, validateTrackingNumber } from '../src/lib/shippingValidation.ts'
import { confirmedPackingChecklist } from '../src/lib/packingConfirmation.ts'
import { readFileSync } from 'node:fs'

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
  assert.equal(validateTrackingNumber('TRACK-123'), null)
  assert.match(validateTrackingNumber('   '), /wajib/)
  assert.match(validateTrackingNumber('BAD\nTRACK'), /tidak valid/)
})

test('packing checklist is created only after an explicit affirmative confirmation', () => {
  assert.equal(confirmedPackingChecklist(false), null)
  assert.deepEqual(confirmedPackingChecklist(true), { bottles_checked: true, formula_stickers_checked: true, bottles_sealed: true, packaging_ready: true, recipient_label_checked: true })
})

test('vendor shipping view uses one shipment RPC payload, separated stages, and excludes commercial totals', () => {
  const source = readFileSync(new URL('../src/pages/VendorShippingPage.tsx', import.meta.url), 'utf8')
  const workspace = readFileSync(new URL('../src/pages/VendorWorkPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /listShipments\(status, 0\)/)
  assert.match(source, /formula_jobs/)
  assert.match(source, /Tandai Sedang Dikirim/)
  assert.match(source, /Edit Nomor Resi/)
  assert.match(source, /correctShipmentTracking/)
  assert.doesNotMatch(source, /vendor-shipping-tabs/)
  assert.match(workspace, /Siap dikirim/)
  assert.match(workspace, /Sedang dikirim/)
  assert.match(workspace, /status=\{stage === 'done' \? 'delivered' : stage\}/)
  assert.doesNotMatch(workspace, /id: 'shipping'/)
  assert.doesNotMatch(source, /formatPrice|saveShipmentPacking|saveActualShipping|listShipmentFormulaJobs/)
})

test('vendor workspace keeps refresh manual and formula notes responsive without customer card selectors', () => {
  const production = readFileSync(new URL('../src/pages/VendorProductionPage.tsx', import.meta.url), 'utf8')
  const shipping = readFileSync(new URL('../src/pages/VendorShippingPage.tsx', import.meta.url), 'utf8')
  const operations = readFileSync(new URL('../src/components/OperationsPresentation.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/admin.css', import.meta.url), 'utf8')

  assert.doesNotMatch(production, /setInterval|addEventListener\('focus'/)
  assert.match(production, /Memuat pesanan/)
  assert.match(production, /Mulai racik/)
  assert.match(production, /variant="vendor"/)
  assert.match(production, /isolated/)
  assert.match(shipping, /status: 'ready_to_ship' \| 'shipped' \| 'delivered'/)
  assert.doesNotMatch(shipping, /customer-order vendor-shipping-card/)
  assert.match(operations, /isolated = false/)
  assert.match(css, /vendor-production-card \.production-formula--vendor/)
  assert.match(css, /grid-template-columns:1fr/)
})

test('tracking correction stays behind an authenticated RPC with a private audit trail', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261110063607_vendor_tracking_correction.sql', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../.github/workflows/phase2-validation.yml', import.meta.url), 'utf8')
  assert.match(migration, /create table private\.shipment_tracking_corrections/)
  assert.match(migration, /revoke all on private\.shipment_tracking_corrections from public,anon,authenticated/)
  assert.match(migration, /create or replace function private\.prepare_shipment\(\)/)
  assert.match(migration, /Dispatched shipment tracking requires the correction workflow/)
  assert.match(migration, /c\.id::text=current_setting\('app\.tracking_correction_id',true\)/)
  assert.match(migration, /create function private\.correct_shipment_tracking[\s\S]*security definer set search_path=''/)
  assert.match(migration, /actor_role not in \('vendor','admin'\)/)
  assert.match(migration, /shipment\.status<>'shipped'/)
  assert.match(migration, /grant execute on function public\.correct_shipment_tracking\(uuid,text\) to authenticated/)
  assert.match(workflow, /supabase\/tests\/shipment_tracking_correction\.sql/)
})
