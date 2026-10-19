import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fulfillShipment, listShipmentFormulaJobs, listShipments, overrideShipmentService, saveActualShipping, saveShipmentPacking, shipmentLabels, type PackingChecklist, type Shipment, type ShipmentFormulaJob, type ShipmentStatus, type ShippingDetails, type ShippingPayer } from '../lib/shipments'
import { formatPrice } from '../lib/currency'
import { errorMessage } from '../lib/supabase'
import { ShipmentStatus as ShipmentDetails } from '../components/ShipmentStatus'
import { formatOrderCopy, formatShippingAddress, labelPrintHtml, packingSlipPrintHtml } from '../lib/fulfillmentDocuments'
import { WorkspaceCardHeader } from '../components/WorkspacePresentation'

const tabs: ShipmentStatus[] = ['ready_to_ship', 'shipped', 'delivered', 'pending']
const packingItems: Array<[keyof PackingChecklist, string]> = [
  ['bottles_checked', 'Bottle count and size match the order.'],
  ['formula_stickers_checked', 'Formula and note labels match.'],
  ['bottles_sealed', 'Bottles are securely sealed.'],
  ['packaging_ready', 'Packaging or pouch is ready.'],
  ['recipient_label_checked', 'Recipient label is checked.'],
]
const payerLabels: Record<ShippingPayer, string> = { vendor: 'Vendor paid', perfun: 'Perfun paid', customer: 'Customer paid' }

function checklistFor(shipment: Shipment): PackingChecklist {
  return shipment.packing_checklist ?? { bottles_checked: false, formula_stickers_checked: false, bottles_sealed: false, packaging_ready: false, recipient_label_checked: false }
}
function openPrintDocument(html: string) {
  const popup = window.open('', '_blank', 'width=480,height=720')
  if (!popup) throw new Error('Print window was blocked. Allow pop-ups and try again.')
  popup.opener = null
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  popup.print()
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy failed')
}

export function FulfillmentPage({ role, initialStatus = 'ready_to_ship', availableStatuses = tabs }: { role: 'vendor' | 'admin'; initialStatus?: ShipmentStatus; availableStatuses?: ShipmentStatus[] }) {
  const [filter, setFilter] = useState<{ status: ShipmentStatus; page: number }>({ status: initialStatus, page: 0 })
  return <section className="app-screen fulfillment-screen">
    <header className="screen-title"><span>FULFILLMENT</span><h1>{role === 'vendor' ? 'Packing & Shipping' : 'Shipping Queue'}</h1><p>{role === 'vendor' ? 'Pack completed orders, finalize delivery cost, then dispatch.' : 'Monitor packing and delivery handled by assigned vendors.'}</p></header>
    <nav className="production-filters" aria-label="Shipment status">{availableStatuses.map(status => <button key={status} aria-pressed={status === filter.status} onClick={() => setFilter({ status, page: 0 })}>{shipmentLabels[status]}</button>)}</nav>
    <FulfillmentList key={`${filter.status}:${filter.page}:${role}`} role={role} status={filter.status} page={filter.page} onPage={page => setFilter(current => ({ ...current, page }))}/>
  </section>
}

function FulfillmentList({ role, status, page, onPage }: { role: 'vendor' | 'admin'; status: ShipmentStatus; page: number; onPage: (page: number) => void }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const result = await listShipments(status, page)
        if (active) { setShipments(result.shipments); setCount(result.count); setError('') }
      } catch (error) { if (active) { setShipments([]); setError(errorMessage(error)) } }
      finally { if (active) setLoading(false) }
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
    <div className="production-list">{shipments.map(shipment => <ShipmentCard key={shipment.id} shipment={shipment} role={role} onChanged={message => { setNotice(message); setRevision(n => n + 1) }}/>)}</div>
    <div className="production-pagination"><button disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * 25 >= count} onClick={() => onPage(page + 1)}>Next</button></div>
  </>
}

function ShipmentCard({ shipment, role, onChanged }: { shipment: Shipment; role: 'vendor' | 'admin'; onChanged: (message: string) => void }) {
  const [details, setDetails] = useState<ShippingDetails>({ courier: shipment.courier, service: shipment.service, tracking_number: shipment.tracking_number })
  const [checklist, setChecklist] = useState(() => checklistFor(shipment))
  const [actualCost, setActualCost] = useState(shipment.actual_shipping_cost === null ? '' : String(shipment.actual_shipping_cost))
  const [payer, setPayer] = useState<ShippingPayer | ''>(shipment.shipping_payer ?? '')
  const [overrideReason, setOverrideReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const [formulaJobs, setFormulaJobs] = useState<ShipmentFormulaJob[]>([])
  const [formulaLoading, setFormulaLoading] = useState(true)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const canEdit = role === 'vendor'
  const packed = shipment.packing_status === 'packed'
  const ready = shipment.status === 'ready_to_ship' && shipment.fulfillment_allowed
  const allChecked = packingItems.every(([key]) => checklist[key])
  useEffect(() => {
    let active = true
    void listShipmentFormulaJobs(shipment.order_number)
      .then(rows => { if (active) setFormulaJobs(rows) })
      .catch(() => { if (active) setFormulaJobs([]) })
      .finally(() => { if (active) setFormulaLoading(false) })
    return () => { active = false }
  }, [shipment.order_number])
  async function run(action: () => Promise<Shipment>, notice: (result: Shipment) => string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { onChanged(notice(await action())) } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  function fulfill(type: 'save' | 'ship' | 'deliver') {
    void run(() => fulfillShipment(shipment.id, type, details), result => `${shipment.order_number}: ${type === 'save' ? 'shipping details saved' : shipmentLabels[result.status]}.`)
  }
  function savePacking(complete: boolean) {
    void run(() => saveShipmentPacking(shipment.id, checklist, complete), result => `${shipment.order_number}: ${result.packing_status === 'packed' ? 'packing completed' : 'packing checklist saved'}.`)
  }
  function saveCost() {
    const cost = Number(actualCost)
    if (!Number.isSafeInteger(cost) || cost < 0 || !payer) { setError('Enter a non-negative whole shipping cost and select who paid it.'); return }
    void run(() => saveActualShipping(shipment.id, cost, payer), () => `${shipment.order_number}: actual shipping cost finalized.`)
  }
  function overrideService() {
    if (overrideReason.trim().length < 3) { setError('Enter an override reason (at least 3 characters).'); return }
    void run(() => overrideShipmentService(shipment.id, details.courier, details.service, overrideReason), result => `${shipment.order_number}: shipping service overridden to ${result.courier} ${result.service}.`)
  }
  async function copyAddress() {
    try { await copyText(formatShippingAddress(shipment)); setCopyNotice('Address copied.') }
    catch { setCopyNotice('Copy failed. Select the address text and copy it manually.') }
  }
  async function copyOrder() {
    try { await copyText(formatOrderCopy(shipment, formulaJobs)); setCopyNotice('Order and formula copied.') }
    catch { setCopyNotice('Copy failed. Select the order details and copy them manually.') }
  }
  function printLabel() {
    try { openPrintDocument(labelPrintHtml(shipment)); setCopyNotice('Print label opened.') }
    catch (printError) { setError(errorMessage(printError)) }
  }
  function printPackingSlip() {
    try { openPrintDocument(packingSlipPrintHtml(shipment, formulaJobs)); setCopyNotice('Packing slip opened.') }
    catch (printError) { setError(errorMessage(printError)) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const action = submitter?.value === 'save' ? 'save' : 'ship'
    if (action === 'ship' && !window.confirm(`Mark ${shipment.order_number} as shipped?`)) return
    fulfill(action)
  }
  return <article className="customer-order fulfillment-card">
    <WorkspaceCardHeader orderNumber={shipment.order_number} time={new Date(shipment.ordered_at).toLocaleString()} status={shipmentLabels[shipment.status]}/>
    <section className="fulfillment-address fulfillment-address-copy" aria-label="Shipping information"><div><h2>Shipping information</h2><pre>{formatShippingAddress(shipment)}</pre><p><strong>Courier:</strong> {[shipment.courier, shipment.service].filter(Boolean).join(' / ') || 'Not selected yet'}</p><p><strong>Tracking:</strong> {shipment.tracking_number || 'Not available yet'}</p></div><div className="fulfillment-document-actions"><button type="button" onClick={() => void copyAddress()}>Copy address</button><button type="button" onClick={() => void copyOrder()} disabled={formulaLoading}>Copy order</button><button type="button" onClick={printLabel}>Print label</button><button type="button" onClick={printPackingSlip} disabled={formulaLoading}>Print packing slip</button></div>{formulaLoading ? <p role="status">Loading formula snapshot…</p> : null}{copyNotice ? <p role="status">{copyNotice}</p> : null}</section>
    <ul className="fulfillment-products">{shipment.items_snapshot.map((item, index) => <li key={index}><strong>{item.product.label}</strong><span>{item.product.bottle_count} × {item.product.volume_ml} ml · Quantity: {item.quantity}</span></li>)}</ul>
    <section className="packing-card"><h2>Customer shipping selection</h2>{shipment.customer_shipping ? <><p><strong>{shipment.customer_shipping.courier} / {shipment.customer_shipping.service}</strong></p><p>Customer shipping paid: {formatPrice(shipment.customer_shipping.amount)}. This is separate from the vendor actual shipping cost.</p></> : <p>Legacy order: no customer shipping quote snapshot.</p>}{shipment.shipping_override_history?.length ? <div className="admin-help"><strong>Admin override history</strong>{shipment.shipping_override_history.map(entry => <p key={`${entry.overridden_at}:${entry.new_courier}`}>{entry.original_courier} {entry.original_service} to {entry.new_courier} {entry.new_service}: {entry.reason} ({new Date(entry.overridden_at).toLocaleString()})</p>)}</div> : null}</section>
    <ShipmentDetails shipment={shipment}/>
    {shipment.packing_status === 'legacy_unknown' ? <p className="admin-help">Packing record predates this workflow; historical dispatch remains unchanged.</p> : null}
    {ready && shipment.packing_status !== 'legacy_unknown' ? <section className="packing-card"><h2>Packing</h2><p>{packed ? `Packed${shipment.packed_at ? ` on ${new Date(shipment.packed_at).toLocaleString()}` : ''}.` : 'Complete every item before marking packing complete.'}</p><fieldset className="packing-checklist" disabled={!canEdit || packed || busy}>{packingItems.map(([key, label]) => <label key={key}><input type="checkbox" checked={checklist[key]} onChange={event => setChecklist(current => ({ ...current, [key]: event.target.checked }))}/>{label}</label>)}</fieldset>{canEdit && !packed ? <div className="shipping-actions"><button type="button" disabled={busy} onClick={() => savePacking(false)}>Save checklist</button><button type="button" className="orders-build" disabled={busy || !allChecked} onClick={() => savePacking(true)}>Packing complete</button></div> : null}</section> : null}
    {ready && packed ? <section className="packing-card"><h2>Actual shipping cost</h2><p>Internal operational record. It is separate from shipping collected at checkout.</p><div className="shipping-cost-grid"><label>Actual cost (Rp)<input inputMode="numeric" value={actualCost} disabled={!canEdit || busy} onChange={event => setActualCost(event.target.value.replace(/[^0-9]/g, ''))}/></label><label>Paid by<select value={payer} disabled={!canEdit || busy} onChange={event => setPayer(event.target.value as ShippingPayer | '')}><option value="">Select payer</option>{(Object.keys(payerLabels) as ShippingPayer[]).map(value => <option key={value} value={value}>{payerLabels[value]}</option>)}</select></label></div>{canEdit ? <button type="button" disabled={busy} onClick={saveCost}>Finalize actual shipping</button> : null}{shipment.actual_shipping_cost !== null && shipment.shipping_payer ? <p className="admin-help">Finalized: Rp{shipment.actual_shipping_cost.toLocaleString('id-ID')} · {payerLabels[shipment.shipping_payer]}</p> : null}</section> : null}
    {error ? <p role="alert">{error}</p> : null}
    {ready && packed && canEdit ? <form className="shipping-form" onSubmit={submit}>{shipment.customer_shipping ? <p className="admin-help">Courier and service are locked to the customer selection or Admin override.</p> : null}{(['courier', 'service', 'tracking_number'] as const).map(field => <label key={field} htmlFor={`${shipment.id}-${field}`}>{field === 'tracking_number' ? 'Tracking number' : field === 'courier' ? 'Courier' : 'Service'}<input id={`${shipment.id}-${field}`} name={field} value={details[field]} maxLength={field === 'tracking_number' ? 150 : 100} required disabled={busy} readOnly={Boolean(shipment.customer_shipping) && field !== 'tracking_number'} autoComplete="off" onChange={event => setDetails(current => ({ ...current, [field]: event.target.value }))}/></label>)}<div className="shipping-actions"><button type="submit" value="save" formNoValidate disabled={busy}>Save details</button><button type="submit" value="ship" className="orders-build" disabled={busy || shipment.actual_shipping_cost === null || !shipment.shipping_payer}>{busy ? 'Saving…' : 'Mark as Shipped'}</button></div></form> : null}
    {role === 'admin' && !['shipped', 'delivered'].includes(shipment.status) ? <section className="packing-card"><h2>Admin shipping override</h2><p>Requires a reason. Customer shipping paid and order total never change.</p><div className="shipping-cost-grid"><label>Courier<input value={details.courier} maxLength={100} disabled={busy} onChange={event => setDetails(current => ({ ...current, courier: event.target.value }))}/></label><label>Service<input value={details.service} maxLength={100} disabled={busy} onChange={event => setDetails(current => ({ ...current, service: event.target.value }))}/></label></div><label>Reason<textarea value={overrideReason} maxLength={1000} disabled={busy} onChange={event => setOverrideReason(event.target.value)}/></label><button type="button" disabled={busy || (details.courier === shipment.courier && details.service === shipment.service)} onClick={overrideService}>Record override</button></section> : null}
    {shipment.status === 'shipped' && role === 'admin' ? <button className="orders-build" disabled={busy} onClick={() => fulfill('deliver')}>{busy ? 'Saving…' : 'Mark as Delivered'}</button> : null}
    {shipment.status === 'pending' ? <p>Waiting for production completion and fulfillment clearance.</p> : null}
  </article>
}
