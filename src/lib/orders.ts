import { requireSupabase } from './supabase'
import type { ShipmentSummary } from './shipments'

export interface AddressInput {
  recipient_name: string; phone: string; address_line: string; city: string; province: string; postal_code: string; label: string; is_default: boolean
}
export interface Address extends AddressInput { id: string; user_id: string; rajaongkir_destination_id?: number | null; rajaongkir_destination_label?: Record<string, unknown>; rajaongkir_destination_verified_at?: string | null }
export interface FormulaIntent { top: string; middle: string; base: string }
export interface OrderIntent { product_id: string; formulas: FormulaIntent[]; quantity: number }
export interface OrderLine {
  product_snapshot: { id: string; label: string; volume_ml: number; bottle_count: number }
  creations_snapshot: Array<{ id?: string; name: string; notes: Array<{ phase: string; note: { id: string; name: string } }> }>
  quantity: number; normal_unit_price: number; unit_price: number; line_total: number
}
export interface Quote { address_snapshot: AddressInput; items: OrderLine[]; subtotal: number; discount: number; shipping: number; grand_total: number; quote_token: string }
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'
export interface PaymentSummary { id: string; provider: string; status: PaymentStatus; amount: number; paid_at: string | null }
export interface CustomerOrder extends Omit<Quote, 'items' | 'quote_token'> { id: string; user_id: string; order_number: string; status: string; payment_status: PaymentStatus; created_at: string; order_items: OrderLine[]; payments: PaymentSummary[]; shipment: ShipmentSummary | null }

export async function listAddresses() {
  const { data, error } = await requireSupabase().from('addresses').select('*').order('is_default', { ascending: false }).order('created_at')
  if (error) throw error
  return data as Address[]
}
export async function saveAddress(id: string, address: AddressInput) {
  const { error } = await requireSupabase().rpc('save_address', { p_id: id, p_address: address })
  if (error) throw error
}
export async function deleteAddress(id: string) {
  const { error } = await requireSupabase().from('addresses').delete().eq('id', id)
  if (error) throw error
}
export async function quoteOrder(addressId: string, items: OrderIntent[], shippingQuoteId: string): Promise<Quote> {
  const { data, error } = await requireSupabase().rpc('quote_order', { p_address_id: addressId, p_items: items, p_shipping_quote_id: shippingQuoteId })
  if (error) throw error
  return data as Quote
}
export async function placeOrder(addressId: string, items: OrderIntent[], shippingQuoteId: string, requestId: string, token: string) {
  const { data, error } = await requireSupabase().rpc('place_order', { p_address_id: addressId, p_items: items, p_shipping_quote_id: shippingQuoteId, p_request_id: requestId, p_quote_token: token })
  if (error) throw error
  return data.order_id as string
}
export async function getOrder(id: string): Promise<CustomerOrder> {
  const { data, error } = await requireSupabase().from('orders').select('*,order_items(*),payments(id,provider,status,amount,paid_at),shipment:shipments(status,courier,service,tracking_number,shipped_at,delivered_at)').eq('id', id).order('position', { referencedTable: 'order_items' }).single()
  if (error) throw error
  return data as CustomerOrder
}
export async function listOrders(): Promise<CustomerOrder[]> {
  const { data, error } = await requireSupabase().from('orders').select('*,order_items(*),payments(id,provider,status,amount,paid_at),shipment:shipments(status,courier,service,tracking_number,shipped_at,delivered_at)').order('created_at', { ascending: false }).order('position', { referencedTable: 'order_items' })
  if (error) throw error
  return data as CustomerOrder[]
}
