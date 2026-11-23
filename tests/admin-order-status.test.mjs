import test from 'node:test'
import assert from 'node:assert/strict'
import { processAdminOrderStatus } from '../src/lib/adminOrderStatus.ts'

const order = (payment_status, changes = {}) => ({ payment_status, shipment_status: 'pending', production_status: 'queued', ...changes })

test('Admin prioritizes payment status over production status', () => {
  assert.equal(processAdminOrderStatus(order('pending')), 'Menunggu pembayaran')
  assert.equal(processAdminOrderStatus(order('expired')), 'Pembayaran kedaluwarsa')
  assert.equal(processAdminOrderStatus(order('failed')), 'Pembayaran gagal')
  assert.equal(processAdminOrderStatus(order('refunded')), 'Pembayaran dikembalikan')
})

test('paid Admin orders retain production and shipment labels', () => {
  assert.equal(processAdminOrderStatus(order('paid')), 'Antrean produksi')
  assert.equal(processAdminOrderStatus(order('paid', { production_status: 'in_production' })), 'Sedang diracik')
  assert.equal(processAdminOrderStatus(order('paid', { shipment_status: 'ready_to_ship' })), 'Siap dikirim')
  assert.equal(processAdminOrderStatus(order('paid', { shipment_status: 'shipped' })), 'Sedang dikirim')
  assert.equal(processAdminOrderStatus(order('paid', { shipment_status: 'delivered' })), 'Selesai')
})

test('unknown payment status never enters a production label', () => {
  assert.equal(processAdminOrderStatus(order('processing', { production_status: 'in_production' })), 'Pembayaran belum terkonfirmasi')
})

test('Admin production and queue filters request paid orders only', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8')
  const productionSection = source.slice(source.indexOf("if (filter === 'production')"), source.indexOf('const filters:'))
  assert.match(source, /filter === 'queue'.*payment: 'paid'/s)
  assert.equal((productionSection.match(/payment: 'paid'/g) ?? []).length, 2)
})
