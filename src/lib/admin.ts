import { requireSupabase } from './supabase'
import type { NoteLayer } from '../types'

export interface AdminOverview {
  orders_today: number; pending_payment: number; paid_orders: number; production_queued: number; production_in_progress: number
  ready_to_ship: number; shipped: number; delivered: number; paid_gross_sales: number; discounts: number
  shipping_collected: number; net_transaction_total: number; timezone: string; as_of: string
}
export interface AdminOrder {
  id: string; order_number: string; public_order_number: string; created_at: string; status: string; payment_status: string; grand_total: number
  customer: { name: string; email: string }; shipment_status: string; production_status: string
  item_count: number; job_count: number; queued: number; in_progress: number; completed: number
  products: Array<{ label: string; volume_ml: number; bottle_count: number; quantity: number; notes?: Array<{ phase: string; id?: string; name: string }>; blends?: Array<{ label?: string; notes?: Array<{ phase: string; id?: string; name: string }> }> }>
  shipment?: { courier?: string | null; service?: string | null; tracking_number?: string | null } | null
}
export interface AdminCustomer { id: string; name: string; email: string; total_orders: number; last_order: string | null }
export interface AdminPhase { phase: NoteLayer; enabled: boolean; sort_order: number; prediction_text: string }
export interface AdminNote { id: string; name: string; active: boolean; category: string; descriptor: string; sticker_asset: string | null; version: number; phases: AdminPhase[] }
export interface AdminProduct { id: string; label: string; active: boolean; version: number; regular_price: number; sale_price: number | null; stock_on_hand: number | null; stock_reserved: number; stock_sold: number; stock_tracking_enabled: boolean }
export interface AdminCatalog { notes: AdminNote[]; products: AdminProduct[] }
export interface AdminOrderFilters { search: string; payment: string; production: string; shipment: string; page: number }
export interface AdminPage<T> { rows: T[]; count: number }
export interface AdminVendor { id: string; name: string | null; email: string | null }
export interface AdminVendorFeeLine { position: number; product_id: string; quantity: number; unit_fee: number; line_fee: number }
export interface AdminVendorAssignment { order_id: string; order_number: string; public_order_number: string; status: string; payment_status: string; vendor_id: string; vendor: AdminVendor; assigned_at: string; assignment_source: 'manual' | 'default' | 'backfill'; vendor_fee_amount: number; vendor_fee_snapshot: { policy_version: number; currency: 'IDR'; lines: AdminVendorFeeLine[]; total_fee: number } }
export interface AdminVendorWorkspace { default_vendor_id: string | null; vendors: AdminVendor[]; unassigned_count: number; unassigned_orders: Array<{ id: string; order_number: string; public_order_number: string; created_at: string; status: string; grand_total: number; products: Array<{ label: string; volume_ml: number; bottle_count: number; quantity: number }> }> }
export type FinancePeriod = 'today' | 'yesterday' | 'month' | 'all' | 'custom'
export interface AdminFinanceDaily { day: string; unique_customers: number; orders: number; paid_orders: number; unpaid_orders: number; refunded_orders: number; product_sales_after_discount: number; customer_shipping: number; customer_payments: number; vendor_service_paid: number; vendor_shipping_paid: number; vendor_paid: number }
export interface AdminFinance { timezone: string; period: FinancePeriod; date: string | null; start_date: string | null; end_date: string | null; orders: { unique_customers: number; orders: number; paid_orders: number; unpaid_orders: number; refunded_orders: number }; payments: { product_sales_after_discount: number; customer_shipping: number; customer_payments: number }; vendor: { outstanding_service: number; outstanding_shipping: number; outstanding_total: number; draft_service: number; draft_shipping: number; draft_total: number; paid_service: number; paid_shipping: number; paid_total: number }; daily: AdminFinanceDaily[]; limitations: { refunds: string; payment_fees: string; vendor_new_billings: string } }
async function rpc<T>(name: string, args = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args)
  if (error) throw error
  return data as T
}
export const getAdminOverview = () => rpc<AdminOverview>('admin_overview')
export const getAdminFinance = (period: FinancePeriod, date: string | null) => rpc<AdminFinance>('admin_finance', { p_period: period, p_date: date })
export const getAdminCatalog = () => rpc<AdminCatalog>('admin_catalog')
export const getAdminOrders = (f: AdminOrderFilters) => rpc<AdminPage<AdminOrder>>('admin_orders', { p_search: f.search, p_payment: f.payment || null, p_production: f.production || null, p_shipment: f.shipment || null, p_page: f.page })
export const getAdminCustomers = (search: string, page: number) => rpc<AdminPage<AdminCustomer>>('admin_customers', { p_search: search, p_page: page })
export const getAdminVendorWorkspace = (page: number) => rpc<AdminVendorWorkspace>('admin_vendor_workspace', { p_page: page })
export const getAdminVendorAssignments = (page: number) => rpc<AdminPage<AdminVendorAssignment>>('admin_vendor_assignments', { p_page: page })
export const adminAssignVendor = (orderId: string, vendorId: string) => rpc<Pick<AdminVendorAssignment, 'order_id' | 'vendor_id' | 'vendor_fee_amount' | 'vendor_fee_snapshot' | 'assigned_at'>>('admin_assign_vendor', { p_order_id: orderId, p_vendor_id: vendorId })
export const setAdminDefaultVendor = (vendorId: string | null) => rpc<void>('admin_set_default_vendor', { p_vendor_id: vendorId })
export async function saveAdminNote(note: AdminNote, phases: AdminPhase[]) {
  await rpc('admin_save_note', { p_id: note.id, p_version: note.version, p_active: note.active, p_category: note.category, p_descriptor: note.descriptor, p_phases: phases })
  window.dispatchEvent(new Event('perfun-catalog-updated'))
}
export async function saveAdminProduct(product: AdminProduct, stockOnHand: number | null, stockTrackingEnabled: boolean) {
  await rpc('admin_save_product', { p_id: product.id, p_version: product.version, p_active: product.active, p_regular_price: product.regular_price, p_sale_price: product.sale_price, p_stock_on_hand: stockOnHand, p_stock_tracking_enabled: stockTrackingEnabled })
  window.dispatchEvent(new Event('perfun-catalog-updated'))
}
