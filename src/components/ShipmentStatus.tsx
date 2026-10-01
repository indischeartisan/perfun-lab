import { shipmentLabels, type ShipmentSummary } from '../lib/shipments'

export function ShipmentStatus({ shipment }: { shipment: ShipmentSummary | null }) {
  return <section className="shipment-summary" aria-label="Shipment details">
    <p>Shipment: <strong>{shipment ? shipmentLabels[shipment.status] : 'Awaiting production'}</strong></p>
    {shipment?.courier ? <p>Courier: {shipment.courier}{shipment.service ? ` · ${shipment.service}` : ''}</p> : null}
    {shipment?.tracking_number ? <p>Tracking number: <strong>{shipment.tracking_number}</strong></p> : null}
    {shipment?.shipped_at ? <p>Shipped: <time dateTime={shipment.shipped_at}>{new Date(shipment.shipped_at).toLocaleString()}</time></p> : null}
    {shipment?.delivered_at ? <p>Delivered: <time dateTime={shipment.delivered_at}>{new Date(shipment.delivered_at).toLocaleString()}</time></p> : null}
  </section>
}
