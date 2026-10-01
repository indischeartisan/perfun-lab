import { requireSupabase } from './supabase'

export type ShipmentStatus = 'pending' | 'ready_to_ship' | 'shipped' | 'delivered'
export const shipmentLabels: Record<ShipmentStatus, string> = { pending: 'Pending', ready_to_ship: 'Ready to Ship', shipped: 'Shipped', delivered: 'Delivered' }
export interface ShipmentSummary {
  status: ShipmentStatus; courier: string; service: string; tracking_number: string
  shipped_at: string | null; delivered_at: string | null
}
export interface Shipment extends ShipmentSummary {
  id: string; order_id: string; order_number: string; ordered_at: string; created_at: string; updated_at: string
  fulfillment_allowed: boolean; shipping_cost: number; provider: string; provider_reference: string | null
  address_snapshot: { recipient_name: string; phone: string; address_line: string; city: string; province: string; postal_code: string; district: string | null; delivery_note: string | null }
  items_snapshot: Array<{ product: { label: string; volume_ml: number; bottle_count: number }; quantity: number }>
}
export interface ShippingDetails { courier: string; service: string; tracking_number: string }
export async function listShipments(status: ShipmentStatus, page: number) {
  const { data, count, error } = await requireSupabase().from('shipments').select('*', { count: 'exact' })
    .eq('status', status).order('ordered_at').order('id').range(page * 25, page * 25 + 24)
  if (error) throw error
  return { shipments: data as Shipment[], count: count ?? 0 }
}
export async function fulfillShipment(id: string, action: 'save' | 'ship' | 'deliver', details?: ShippingDetails) {
  const { data, error } = await requireSupabase().rpc('fulfill_shipment', {
    p_shipment_id: id, p_action: action, p_courier: details?.courier ?? '',
    p_service: details?.service ?? '', p_tracking_number: details?.tracking_number ?? '',
  })
  if (error) throw error
  return data as Shipment
}
