import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Copy, Printer, Truck } from 'lucide-react'
import { FormulaNotes } from '../components/WorkspacePresentation'
import { errorMessage } from '../lib/supabase'
import { correctShipmentTracking, fulfillShipment, listShipments, type Shipment, type ShipmentStatus } from '../lib/shipments'
import { validateTrackingNumber } from '../lib/shippingValidation'
import './vendorShipping.css'

const label: Record<ShipmentStatus, string> = { pending: 'Menunggu', ready_to_ship: 'Siap dikirim', shipped: 'Sedang dikirim', delivered: 'Selesai' }

function addressText(shipment: Shipment) {
  const address = shipment.address_snapshot
  return [address.recipient_name, address.phone, address.address_line, `${address.city}, ${address.province}${address.postal_code ? ` ${address.postal_code}` : ''}`].join('\n')
}

export function VendorShippingPage({ status, onShipped }: { status: 'ready_to_ship' | 'shipped' | 'delivered'; onShipped: () => void }) {
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
  const heading = status === 'ready_to_ship' ? 'Siap dikirim' : status === 'shipped' ? 'Sedang dikirim' : 'Selesai'
  const description = status === 'ready_to_ship' ? 'Pesanan siap diserahkan ke kurir.' : status === 'shipped' ? 'Pesanan yang sedang dalam perjalanan ke pelanggan.' : 'Pesanan yang telah diterima pelanggan.'
  const emptyCopy = status === 'ready_to_ship' ? 'Pesanan akan muncul setelah seluruh racikan selesai.' : status === 'shipped' ? 'Belum ada pesanan yang sedang dikirim.' : 'Belum ada pesanan yang telah selesai dikirim.'
  return <section className="app-screen vendor-shipping-page"><header className="vendor-shipping-heading"><span>WORKSPACE VENDOR</span><h1>{heading}</h1><p>{description}</p></header>{error ? <p className="cloud-message" role="alert">{error} <button onClick={() => void refresh()}>Coba lagi</button></p> : null}{loading ? <p role="status">Memuat pengiriman…</p> : null}<div className="vendor-shipping-list">{shipments.map(shipment => <ShipmentCard key={shipment.id} shipment={shipment} onOpen={() => { setSelected(shipment); window.scrollTo({ top: 0, behavior: 'instant' }) }}/>)}</div>{!loading && !error && !shipments.length ? <div className="screen-empty"><h2>Belum ada pesanan</h2><p>{emptyCopy}</p></div> : null}</section>
}

function ShipmentCard({ shipment, onOpen }: { shipment: Shipment; onOpen: () => void }) {
  const jobs = shipment.formula_jobs ?? []
  const first = jobs[0]
  const additional = Math.max(0, jobs.length - 1)
  return <article className="vendor-shipping-card"><header><div><time>{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(shipment.ordered_at))}</time><strong title={shipment.order_number}>{shipment.order_number}</strong></div><b>{label[shipment.status]}</b></header><div className="vendor-shipping-recipient"><strong>{shipment.address_snapshot.recipient_name}</strong><span>{shipment.address_snapshot.city} · {shipment.address_snapshot.province}</span></div>{first ? <div className="vendor-shipping-product"><div><h2>{first.product_snapshot.label}</h2><p>{first.product_snapshot.volume_ml} ml · {first.quantity} botol</p></div><FormulaNotes formula={first.formulas_snapshot[0] ?? { top: null, middle: null, base: null }} title="Notes parfum" variant="vendor" />{additional ? <small>+{additional} parfum lainnya</small> : null}</div> : null}<footer><span><Truck aria-hidden="true" />{shipment.courier} · {shipment.service}</span><button type="button" onClick={onOpen}>Lihat Detail <ChevronRight aria-hidden="true" /></button></footer></article>
}

function VendorShipmentDetail({ shipment, onBack, onShipped }: { shipment: Shipment; onBack: () => void; onShipped: () => void }) {
  const [currentShipment, setCurrentShipment] = useState(shipment)
  const [tracking, setTracking] = useState(shipment.tracking_number)
  const [editingTracking, setEditingTracking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const lock = useRef(false)
  const canShip = currentShipment.status === 'ready_to_ship' && currentShipment.fulfillment_allowed && tracking.trim().length > 0
  const copy = async () => { try { await navigator.clipboard.writeText(addressText(currentShipment)); setNotice('Alamat berhasil disalin.') } catch { setError('Alamat belum dapat disalin. Coba lagi.') } }
  const print = () => window.print()
  const ship = async () => {
    if (!canShip || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await fulfillShipment(currentShipment.id, 'ship', { courier: currentShipment.courier, service: currentShipment.service, tracking_number: tracking.trim() }); setNotice('Pengiriman tercatat.'); onShipped(); onBack() }
    catch (cause) { setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function saveTrackingCorrection() {
    const validationError = validateTrackingNumber(tracking)
    if (validationError) { setError(validationError); return }
    if (tracking.trim() === currentShipment.tracking_number) { setEditingTracking(false); return }
    if (!window.confirm('Simpan nomor resi baru? Status pengiriman dan layanan kurir tidak akan berubah.')) return
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const updated = await correctShipmentTracking(currentShipment.id, tracking.trim())
      setCurrentShipment(current => ({ ...current, ...updated, formula_jobs: current.formula_jobs }))
      setTracking(updated.tracking_number)
      setEditingTracking(false)
      setNotice('Nomor resi berhasil diperbarui.')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="app-screen vendor-shipping-detail"><button className="vendor-shipping-back" onClick={onBack}>Kembali</button><header className="vendor-shipping-detail-header"><div><time>{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(currentShipment.ordered_at))}</time><strong>{currentShipment.order_number}</strong></div><b>{label[currentShipment.status]}</b></header><section className="vendor-shipping-detail-card"><h1>Parfum</h1>{(currentShipment.formula_jobs ?? []).map((job, index) => <article key={job.id}><h2>{job.product_snapshot.label} {index + 1}</h2><p>{job.product_snapshot.volume_ml} ml · {job.quantity} botol</p><FormulaNotes formula={job.formulas_snapshot[0] ?? { top: null, middle: null, base: null }} title="Top, Middle, Base" variant="vendor" /></article>)}</section><section className="vendor-shipping-detail-card vendor-shipping-address"><h2>Penerima & alamat</h2><p><strong>{currentShipment.address_snapshot.recipient_name}</strong><br />{currentShipment.address_snapshot.phone}<br />{currentShipment.address_snapshot.address_line}<br />{currentShipment.address_snapshot.city}, {currentShipment.address_snapshot.province} {currentShipment.address_snapshot.postal_code}</p><div><button type="button" onClick={() => void copy()}><Copy /> Salin Alamat</button><button type="button" onClick={print}><Printer /> Cetak Alamat</button></div></section><section className="vendor-shipping-detail-card"><h2>Pengiriman</h2><p><strong>{currentShipment.courier} · {currentShipment.service}</strong></p>{currentShipment.tracking_number ? <p>Resi: {currentShipment.tracking_number}</p> : null}{currentShipment.status === 'ready_to_ship' ? <label>Nomor resi<input value={tracking} maxLength={150} disabled={busy} onChange={event => setTracking(event.target.value)} /></label> : null}{currentShipment.status === 'ready_to_ship' ? <button className="orders-build" disabled={!canShip || busy} onClick={() => void ship()}>{busy ? 'Menyimpan…' : 'Tandai Sedang Dikirim'}</button> : null}{currentShipment.status === 'shipped' && !editingTracking ? <><p className="vendor-shipping-shipped">Paket sudah diserahkan ke kurir.</p><button type="button" onClick={() => { setTracking(currentShipment.tracking_number); setEditingTracking(true) }}>Edit Nomor Resi</button></> : null}{currentShipment.status === 'shipped' && editingTracking ? <div className="vendor-tracking-correction"><label>Nomor resi baru<input value={tracking} maxLength={150} disabled={busy} autoComplete="off" onChange={event => setTracking(event.target.value)} /></label><div><button type="button" disabled={busy} onClick={() => { setTracking(currentShipment.tracking_number); setEditingTracking(false); setError('') }}>Batal</button><button type="button" className="orders-build" disabled={busy} onClick={() => void saveTrackingCorrection()}>{busy ? 'Menyimpan…' : 'Simpan Nomor Resi'}</button></div></div> : null}</section>{notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert">{error}</p> : null}<section className="vendor-shipping-print" aria-hidden="true"><p>Perfun Lab</p><strong>Nomor pesanan: {currentShipment.order_number}</strong><h1>{currentShipment.address_snapshot.recipient_name}</h1><p>{currentShipment.address_snapshot.phone}</p><p>{currentShipment.address_snapshot.address_line}<br />{currentShipment.address_snapshot.city}, {currentShipment.address_snapshot.province} {currentShipment.address_snapshot.postal_code}</p></section></section>
}
