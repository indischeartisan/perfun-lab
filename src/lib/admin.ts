import { requireSupabase } from './supabase'
import type { NoteLayer } from '../types'

export interface AdminOverview {
  orders_today: number; pending_payment: number; paid_orders: number; production_queued: number; production_in_progress: number
  ready_to_ship: number; shipped: number; delivered: number; paid_gross_sales: number; discounts: number
  shipping_collected: number; net_transaction_total: number; timezone: string; as_of: string
}
export interface AdminOrder {
  id: string; order_number: string; created_at: string; status: string; payment_status: string; grand_total: number
  customer: { name: string; email: string }; shipment_status: string; production_status: string
  item_count: number; job_count: number; queued: number; in_progress: number; completed: number
  products: Array<{ label: string; volume_ml: number; bottle_count: number; quantity: number }>
}
export interface AdminCustomer { id: string; name: string; email: string; total_orders: number; last_order: string | null }
export interface AdminPhase { phase: NoteLayer; enabled: boolean; sort_order: number; prediction_text: string }
export interface AdminNote { id: string; name: string; active: boolean; category: string; descriptor: string; sticker_asset: string | null; version: number; phases: AdminPhase[] }
export interface AdminProduct { id: string; label: string; active: boolean; version: number; regular_price: number; sale_price: number | null }
export interface AdminCatalog { notes: AdminNote[]; products: AdminProduct[] }
export interface AdminOrderFilters { search: string; payment: string; production: string; shipment: string; page: number }
export interface AdminPage<T> { rows: T[]; count: number }
async function rpc<T>(name: string, args = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args)
  if (error) throw error
  return data as T
}
export const getAdminOverview = () => rpc<AdminOverview>('admin_overview')
export const getAdminCatalog = () => rpc<AdminCatalog>('admin_catalog')
export const getAdminOrders = (f: AdminOrderFilters) => rpc<AdminPage<AdminOrder>>('admin_orders', { p_search: f.search, p_payment: f.payment || null, p_production: f.production || null, p_shipment: f.shipment || null, p_page: f.page })
export const getAdminCustomers = (search: string, page: number) => rpc<AdminPage<AdminCustomer>>('admin_customers', { p_search: search, p_page: page })
export async function saveAdminNote(note: AdminNote, phases: AdminPhase[]) {
  await rpc('admin_save_note', { p_id: note.id, p_version: note.version, p_active: note.active, p_category: note.category, p_descriptor: note.descriptor, p_phases: phases })
  window.dispatchEvent(new Event('perfun-catalog-updated'))
}
export async function saveAdminProduct(product: AdminProduct) {
  await rpc('admin_save_product', { p_id: product.id, p_version: product.version, p_active: product.active, p_regular_price: product.regular_price, p_sale_price: product.sale_price })
  window.dispatchEvent(new Event('perfun-catalog-updated'))
}
