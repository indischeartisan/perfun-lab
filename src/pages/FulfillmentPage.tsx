import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fulfillShipment, listShipments, shipmentLabels, type Shipment, type ShipmentStatus, type ShippingDetails } from '../lib/shipments'
import { errorMessage } from '../lib/supabase'
import { ShipmentStatus as ShipmentDetails } from '../components/ShipmentStatus'

const tabs: ShipmentStatus[] = ['ready_to_ship', 'shipped', 'delivered', 'pending']
export function FulfillmentPage() {
  const [filter, setFilter] = useState<{ status: ShipmentStatus; page: number }>({ status: 'ready_to_ship', page: 0 })
  return <section className="app-screen fulfillment-screen">
    <header className="screen-title"><span>FULFILLMENT</span><h1>Shipping Queue</h1><p>Pack the finished fragrances and record their delivery.</p></header>
    <nav className="production-filters" aria-label="Shipment status">{tabs.map(status => <button key={status} aria-pressed={status === filter.status} onClick={() => setFilter({ status, page: 0 })}>{shipmentLabels[status]}</button>)}</nav>
    <FulfillmentList key={`${filter.status}:${filter.page}`} status={filter.status} page={filter.page} onPage={page => setFilter(current => ({ ...current, page }))}/>
  </section>
}

function FulfillmentList({ status, page, onPage }: { status: ShipmentStatus; page: number; onPage: (page: number) => void }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true, fetching = false
    async function refresh() {
      if (fetching) return
      fetching = true
      try {
        const result = await listShipments(status, page)
        if (active) { setShipments(result.shipments); setCount(result.count); setError('') }
      } catch (error) { if (active) { setShipments([]); setError(errorMessage(error)) } }
      finally { fetching = false; if (active) setLoading(false) }
    }
    void refresh()
    const onFocus = () => { void refresh() }
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    window.addEventListener('focus', onFocus)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [status, page, revision])
  return <>
    <div className="production-toolbar"><p role="status">{notice || (loading ? 'Loading shipments…' : `${count} shipments`)}</p><button onClick={() => setRevision(n => n + 1)}>Refresh</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {!loading && !error && !shipments.length ? <div className="screen-empty"><h2>No shipments on this page</h2><p>Orders become ready when all their production jobs are completed.</p></div> : null}
    <div className="production-list">{shipments.map(shipment => <ShipmentCard key={shipment.id} shipment={shipment} onChanged={message => { setNotice(message); setRevision(n => n + 1) }}/>)}</div>
    <div className="production-pagination"><button disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * 25 >= count} onClick={() => onPage(page + 1)}>Next</button></div>
  </>
}

function ShipmentCard({ shipment, onChanged }: { shipment: Shipment; onChanged: (message: string) => void }) {
  const [details, setDetails] = useState<ShippingDetails>({ courier: shipment.courier, service: shipment.service, tracking_number: shipment.tracking_number })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const address = shipment.address_snapshot
  async function action(type: 'save' | 'ship' | 'deliver') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await fulfillShipment(shipment.id, type, details)
      setDetails({ courier: result.courier, service: result.service, tracking_number: result.tracking_number })
      onChanged(`${shipment.order_number}: ${type === 'save' ? 'shipping details saved' : shipmentLabels[result.status]}.`)
    } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    void action(submitter?.value === 'save' ? 'save' : 'ship')
  }
  return <article className="customer-order fulfillment-card">
    <header><strong>{shipment.order_number}</strong><time dateTime={shipment.ordered_at}>{new Date(shipment.ordered_at).toLocaleString()}</time><b className="order-status">{shipmentLabels[shipment.status]}</b></header>
    <section className="fulfillment-address" aria-label="Delivery address"><h2>{address.recipient_name}</h2><p>{address.phone}</p><p>{address.address_line}</p><p>{[address.district, address.city, address.province, address.postal_code].filter(Boolean).join(', ')}</p>{address.delivery_note ? <p>Delivery note: {address.delivery_note}</p> : null}</section>
    <ul className="fulfillment-products">{shipment.items_snapshot.map((item, index) => <li key={index}><strong>{item.product.label}</strong><span>{item.product.bottle_count} × {item.product.volume_ml} ml · Quantity: {item.quantity}</span></li>)}</ul>
    <ShipmentDetails shipment={shipment}/>
    {error ? <p role="alert">{error}</p> : null}
    {shipment.status === 'ready_to_ship' && shipment.fulfillment_allowed ? <form className="shipping-form" onSubmit={submit}>
      {(['courier', 'service', 'tracking_number'] as const).map(field => <label key={field} htmlFor={`${shipment.id}-${field}`}>{field === 'tracking_number' ? 'Tracking number' : field === 'courier' ? 'Courier' : 'Service'}<input id={`${shipment.id}-${field}`} name={field} value={details[field]} maxLength={field === 'tracking_number' ? 150 : 100} required disabled={busy} autoComplete="off" onChange={event => setDetails(current => ({ ...current, [field]: event.target.value }))}/></label>)}
      <div className="shipping-actions"><button type="submit" value="save" formNoValidate disabled={busy}>Save details</button><button type="submit" value="ship" className="orders-build" disabled={busy}>{busy ? 'Saving…' : 'Mark as Shipped'}</button></div>
    </form> : null}
    {shipment.status === 'shipped' ? <button className="orders-build" disabled={busy} onClick={() => action('deliver')}>{busy ? 'Saving…' : 'Mark as Delivered'}</button> : null}
    {shipment.status === 'pending' ? <p>Waiting for production completion and fulfillment clearance.</p> : null}
  </article>
}
