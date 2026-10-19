// A single completed job is never sufficient: use the server's order-level shipment state.
export function isReadyForShipping(shipment: { status: string; fulfillment_allowed: boolean } | null): boolean {
  return shipment?.status === 'ready_to_ship' && shipment.fulfillment_allowed === true
}
