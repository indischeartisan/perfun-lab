import { requireSupabase } from './supabase'

export type ShipmentStatus = 'pending' | 'ready_to_ship' | 'shipped' | 'delivered'
export type PackingStatus = 'not_started' | 'in_progress' | 'packed' | 'legacy_unknown'
export type ShippingPayer = 'vendor' | 'perfun' | 'customer'
export interface PackingChecklist { bottles_checked: boolean; formula_stickers_checked: boolean; bottles_sealed: boolean; packaging_ready: boolean; recipient_label_checked: boolean }
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
  packing_status: PackingStatus; packing_checklist: PackingChecklist; packed_at: string | null; packed_by: string | null
  actual_shipping_cost: number | null; shipping_payer: ShippingPayer | null; actual_shipping_entered_at: string | null; actual_shipping_entered_by: string | null
}
export interface ShippingDetails { courier: string; service: string; tracking_number: string }
export async function listShipments(status: ShipmentStatus, page: number) {
  const { data, error } = await requireSupabase().rpc('list_fulfillment_shipments', { p_status: status, p_page: page })
  if (error) throw error
  const result = data as { rows: Shipment[]; count: number }
  return { shipments: result.rows, count: result.count }
}
export async function fulfillShipment(id: string, action: 'save' | 'ship' | 'deliver', details?: ShippingDetails) {
  const { data, error } = await requireSupabase().rpc('fulfill_shipment', {
    p_shipment_id: id, p_action: action, p_courier: details?.courier ?? '',
    p_service: details?.service ?? '', p_tracking_number: details?.tracking_number ?? '',
  })
  if (error) throw error
  return data as Shipment
}
export async function saveShipmentPacking(id: string, checklist: PackingChecklist, complete: boolean) {
  const { data, error } = await requireSupabase().rpc('save_shipment_packing', { p_shipment_id: id, p_checklist: checklist, p_complete: complete })
  if (error) throw error
  return data as Shipment
}
export async function saveActualShipping(id: string, cost: number, payer: ShippingPayer) {
  const { data, error } = await requireSupabase().rpc('save_actual_shipping', { p_shipment_id: id, p_cost: cost, p_payer: payer })
  if (error) throw error
  return data as Shipment
}
