import type { VendorOrderCursor, VendorProductionOrder } from './production'

export interface VendorOrderPage { rows: VendorProductionOrder[]; has_more: boolean; next_cursor: VendorOrderCursor | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isCursor(value: unknown): boolean {
  return isRecord(value) && typeof value.ordered_at === 'string' && typeof value.order_number === 'string'
}
function isJob(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.product_snapshot) || !Array.isArray(value.formulas_snapshot)) return false
  return typeof value.id === 'string' && typeof value.order_number === 'string' &&
    ['queued', 'in_production', 'completed'].includes(String(value.status)) &&
    (value.assigned_to === null || typeof value.assigned_to === 'string') &&
    typeof value.production_allowed === 'boolean' && typeof value.quantity === 'number' &&
    typeof value.product_snapshot.label === 'string' && typeof value.product_snapshot.volume_ml === 'number' &&
    typeof value.product_snapshot.bottle_count === 'number' &&
    value.formulas_snapshot.every(formula => isRecord(formula) && ['top', 'middle', 'base'].every(key => formula[key] === null || typeof formula[key] === 'string'))
}

export function parseVendorOrderPage(value: unknown): VendorOrderPage {
  if (!isRecord(value) || !Array.isArray(value.rows) || typeof value.has_more !== 'boolean' ||
    (value.next_cursor !== null && !isCursor(value.next_cursor)) || (value.has_more && !isCursor(value.next_cursor)) ||
    !value.rows.every(order => isRecord(order) && typeof order.order_number === 'string' && typeof order.ordered_at === 'string' && Array.isArray(order.jobs) && order.jobs.every(isJob))) {
    throw new Error('Data antrean Vendor tidak sesuai dengan versi aplikasi. Hubungi admin dan coba lagi setelah server diperbarui.')
  }
  return value as unknown as VendorOrderPage
}

export function vendorProjectionError(error: unknown): string {
  if (isRecord(error) && error.code === 'PGRST202') {
    return 'Antrean Vendor belum tersedia pada server ini. Hubungi admin untuk memeriksa versi server, lalu coba lagi.'
  }
  return isRecord(error) && typeof error.message === 'string' ? error.message : 'Antrean Vendor tidak dapat dimuat. Coba lagi.'
}
