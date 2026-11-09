import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Copy, Printer, Truck } from 'lucide-react'
import { FormulaNotes } from '../components/WorkspacePresentation'
import { errorMessage } from '../lib/supabase'
import { fulfillShipment, listShipments, type Shipment, type ShipmentStatus } from '../lib/shipments'
import './vendorShipping.css'

const statuses: ShipmentStatus[] = ['ready_to_ship', 'shipped']
const label: Record<ShipmentStatus, string> = { pending: 'Menunggu', ready_to_ship: 'Siap dikirim', shipped: 'Sedang dikirim', delivered: 'Selesai' }

function addressText(shipment: Shipment) {
  const address = shipment.address_snapshot
  return [address.recipient_name, address.phone, address.address_line, `${address.city}, ${address.province}${address.postal_code ? ` ${address.postal_code}` : ''}`].join('\n')
}

export function VendorShippingPage({ onShipped }: { onShipped: () => void }) {
  const [status, setStatus] = useState<ShipmentStatus>('ready_to_ship')
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Shipment | null>(null)
  const refresh = async () => {
    setLoading(true)
    try { const result = await listShipments(status, 0); setShipments(result.shipments); setError('') }
    catch (cause) { setError(errorMessage(cause)); setShipments([]) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    void listShipments(status, 0).then(result => { if (active) { setShipments(result.shipments); setError('') } }).catch(cause => { if (active) { setError(errorMessage(cause)); setShipments([]) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [status])
  if (selected) return <VendorShipmentDetail shipment={selected} onBack={() => { setSelected(null); void refresh() }} onShipped={onShipped}/>
  return <section className="app-screen vendor-shipping-page"><header className="vendor-shipping-heading"><span>WORKSPACE VENDOR</span><h1>Kirim</h1><p>Pesanan siap diserahkan ke kurir atau sedang dalam perjalanan.</p></header><nav className="vendor-shipping-tabs" aria-label="Status pengiriman">{statuses.map(item => <button key={item} aria-pressed={status === item} onClick={() => setStatus(item)}>{label[item]}</button>)}</nav>{error ? <p className="cloud-message" role="alert">{error} <button onClick={() => void refresh()}>Coba lagi</button></p> : null}{loading ? <p role="status">Memuat pengiriman…</p> : null}<div className="vendor-shipping-list">{shipments.map(shipment => <ShipmentCard key={shipment.id} shipment={shipment} onOpen={() => { setSelected(shipment); window.scrollTo({ top: 0, behavior: 'instant' }) }}/>)}</div>{!loading && !error && !shipments.length ? <div className="screen-empty"><h2>Belum ada pesanan</h2><p>{status === 'ready_to_ship' ? 'Pesanan akan muncul setelah seluruh racikan selesai.' : 'Belum ada pesanan yang sedang dikirim.'}</p></div> : null}</section>
}

function ShipmentCard({ shipment, onOpen }: { shipment: Shipment; onOpen: () => void }) {
  const jobs = shipment.formula_jobs ?? []
  const first = jobs[0]
  const additional = Math.max(0, jobs.length - 1)
  return <article className="customer-order vendor-shipping-card"><header><div><time>{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(shipment.ordered_at))}</time><strong title={shipment.order_number}>{shipment.order_number}</strong></div><b>{label[shipment.status]}</b></header><div className="vendor-shipping-recipient"><strong>{shipment.address_snapshot.recipient_name}</strong><span>{shipment.address_snapshot.city} · {shipment.address_snapshot.province}</span></div>{first ? <div className="vendor-shipping-product"><div><h2>{first.product_snapshot.label}</h2><p>{first.product_snapshot.volume_ml} ml · {first.quantity} botol</p></div><FormulaNotes formula={first.formulas_snapshot[0] ?? { top: null, middle: null, base: null }} title="Notes parfum" variant="compact" />{additional ? <small>+{additional} parfum lainnya</small> : null}</div> : null}<footer><span><Truck aria-hidden="true" />{shipment.courier} · {shipment.service}</span><button type="button" onClick={onOpen}>Lihat Detail <ChevronRight aria-hidden="true" /></button></footer></article>
}

function VendorShipmentDetail({ shipment, onBack, onShipped }: { shipment: Shipment; onBack: () => void; onShipped: () => void }) {
  const [tracking, setTracking] = useState(shipment.tracking_number)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const lock = useRef(false)
  const canShip = shipment.status === 'ready_to_ship' && shipment.fulfillment_allowed && tracking.trim().length > 0
  const copy = async () => { try { await navigator.clipboard.writeText(addressText(shipment)); setNotice('Alamat berhasil disalin.') } catch { setError('Alamat belum dapat disalin. Coba lagi.') } }
  const print = () => window.print()
  const ship = async () => {
    if (!canShip || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await fulfillShipment(shipment.id, 'ship', { courier: shipment.courier, service: shipment.service, tracking_number: tracking.trim() }); setNotice('Pengiriman tercatat.'); onShipped(); onBack() }
    catch (cause) { setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="app-screen vendor-shipping-detail"><button className="vendor-shipping-back" onClick={onBack}>Kembali ke Kirim</button><header className="vendor-shipping-detail-header"><div><time>{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(shipment.ordered_at))}</time><strong>{shipment.order_number}</strong></div><b>{label[shipment.status]}</b></header><section className="vendor-shipping-detail-card"><h1>Parfum</h1>{(shipment.formula_jobs ?? []).map((job, index) => <article key={job.id}><h2>{job.product_snapshot.label} {index + 1}</h2><p>{job.product_snapshot.volume_ml} ml · {job.quantity} botol</p><FormulaNotes formula={job.formulas_snapshot[0] ?? { top: null, middle: null, base: null }} title="Top, Middle, Base" variant="compact" /></article>)}</section><section className="vendor-shipping-detail-card vendor-shipping-address"><h2>Penerima & alamat</h2><p><strong>{shipment.address_snapshot.recipient_name}</strong><br />{shipment.address_snapshot.phone}<br />{shipment.address_snapshot.address_line}<br />{shipment.address_snapshot.city}, {shipment.address_snapshot.province} {shipment.address_snapshot.postal_code}</p><div><button type="button" onClick={() => void copy()}><Copy /> Salin Alamat</button><button type="button" onClick={print}><Printer /> Cetak Alamat</button></div></section><section className="vendor-shipping-detail-card"><h2>Pengiriman</h2><p><strong>{shipment.courier} · {shipment.service}</strong></p>{shipment.tracking_number ? <p>Resi: {shipment.tracking_number}</p> : null}{shipment.status === 'ready_to_ship' ? <label>Nomor resi<input value={tracking} maxLength={150} disabled={busy} onChange={event => setTracking(event.target.value)} /></label> : null}{shipment.status === 'ready_to_ship' ? <button className="orders-build" disabled={!canShip || busy} onClick={() => void ship()}>{busy ? 'Menyimpan…' : 'Tandai Sedang Dikirim'}</button> : <p className="vendor-shipping-shipped">Paket sudah diserahkan ke kurir.</p>}</section>{notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert">{error}</p> : null}<section className="vendor-shipping-print" aria-hidden="true"><p>Perfun Lab</p><strong>Nomor pesanan: {shipment.order_number}</strong><h1>{shipment.address_snapshot.recipient_name}</h1><p>{shipment.address_snapshot.phone}</p><p>{shipment.address_snapshot.address_line}<br />{shipment.address_snapshot.city}, {shipment.address_snapshot.province} {shipment.address_snapshot.postal_code}</p></section></section>
}
