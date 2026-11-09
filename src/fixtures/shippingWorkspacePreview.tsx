/* eslint-disable react-refresh/only-export-components -- Vite-only preview entrypoint. */
import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ChevronRight, PackageCheck, Truck } from 'lucide-react'
import { OperationsOrderCard, OperationsOrderHeader, OperationsPageHeader, OperationsStatusTabs } from '../components/OperationsPresentation'
import { FormulaNotes, type FormulaSnapshot } from '../components/WorkspacePresentation'
import { formatPrice } from '../lib/currency'
import '../styles.css'
import '../theme.css'
import '../admin.css'
import './shippingWorkspacePreview.css'
import './shippingWorkspacePreviewTabs.css'
import './shippingWorkspacePreviewPrint.css'

type ShippingState = 'ready_to_ship' | 'shipped'
type PreviewShipment = { id: string; orderNumber: string; orderedAt: string; status: ShippingState; recipient: string; city: string; province: string; postalCode?: string; address: string; phone: string; courier: string; service: string; trackingNumber: string; volumeMl: number; quantity: number; bundleLabel?: string; formulas: Array<{ name: string; formula: FormulaSnapshot }>; total: number }

const shipments: PreviewShipment[] = [
  { id: 'ready-single', orderNumber: 'PF-5F8B7542E7A9E53DA', orderedAt: '8 Nov 2026, 15:00', status: 'ready_to_ship', recipient: 'Farras Agung Mujafar S.', city: 'Kota Bandung', province: 'Jawa Barat', postalCode: '40124', address: 'Jl. Melati No.12, Cibeunying Kidul', phone: '0812 3456 7890', courier: 'J&T Express', service: 'EZ', trackingNumber: '', volumeMl: 30, quantity: 1, formulas: [{ name: 'Blend 1', formula: { top: 'Yuzu', middle: 'Matcha', base: 'Amber' } }], total: 229000 },
  { id: 'ready-pack', orderNumber: 'PF-3PACK10ML7E2C', orderedAt: '6 Nov 2026, 17:15', status: 'ready_to_ship', recipient: 'Nadia Putri', city: 'Kabupaten Badung', province: 'Bali', postalCode: '80361', address: 'Jl. Raya Kerobokan No.8, Kuta Utara', phone: '0813 2222 7711', courier: 'AnterAja', service: 'REG', trackingNumber: '', volumeMl: 10, quantity: 1, bundleLabel: 'Paket 3 × 10 ml', formulas: [{ name: 'Blend 1', formula: { top: 'Yuzu', middle: 'Matcha', base: 'Sandalwood' } }, { name: 'Blend 2', formula: { top: 'Berries', middle: 'Green Leaves', base: 'Clean Musk' } }, { name: 'Blend 3', formula: { top: 'Pink Pepper', middle: 'Coffee', base: 'Vanilla' } }], total: 357000 },
  { id: 'shipped-single', orderNumber: 'PF-7A91D3C4B9EF91E2F', orderedAt: '7 Nov 2026, 10:21', status: 'shipped', recipient: 'Dimas Pratama', city: 'Jakarta Barat', province: 'DKI Jakarta', postalCode: '11470', address: 'Jl. Tanjung Duren Barat No.21', phone: '0812 9000 1100', courier: 'J&T Express', service: 'EZ', trackingNumber: 'JT123456789ID', volumeMl: 10, quantity: 1, formulas: [{ name: 'Blend 4', formula: { top: 'Pink Pepper', middle: 'Peony', base: 'Sandalwood' } }], total: 118000 },
]

const statusCopy: Record<ShippingState, string> = { ready_to_ship: 'Siap dikirim', shipped: 'Sedang dikirim' }

function ShippingWorkspacePreview() {
  const [role, setRole] = useState<'vendor' | 'admin'>('vendor')
  const [status, setStatus] = useState<ShippingState>('ready_to_ship')
  const [selected, setSelected] = useState<PreviewShipment | null>(null)
  const visible = useMemo(() => shipments.filter((item) => item.status === status), [status])
  const open = (shipment: PreviewShipment) => { setSelected(shipment); window.scrollTo({ top: 0, behavior: 'instant' }) }

  return <div className="shipping-preview-shell">
    <header className="shipping-preview-topbar"><img src="/brand/perfun-lab-logo.webp" alt="Perfun Lab" /><span>PRATINJAU LOKAL - DATA FIKTIF</span></header>
    <nav className="shipping-preview-role" aria-label="Peran workspace"><button className={role === 'vendor' ? 'active' : ''} onClick={() => setRole('vendor')}>Vendor</button><button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>Admin</button></nav>
    <main className="shipping-preview-main">{selected ? <ShipmentDetail shipment={selected} role={role} onBack={() => setSelected(null)} /> : <section className="app-screen shipping-preview-screen"><OperationsPageHeader title="Kirim">{role === 'vendor' ? 'Pesanan yang siap diserahkan ke kurir atau sedang dalam perjalanan.' : 'Pantau status pengiriman dari vendor tanpa detail packing di daftar.'}</OperationsPageHeader><p className="shipping-preview-notice">Fixture lokal: tidak ada login, request Supabase, atau perubahan status.</p><OperationsStatusTabs label="Status pengiriman" items={[{ id: 'ready', label: 'Siap dikirim', count: shipments.filter((item) => item.status === 'ready_to_ship').length, active: status === 'ready_to_ship', onClick: () => setStatus('ready_to_ship') }, { id: 'shipped', label: 'Sedang dikirim', count: shipments.filter((item) => item.status === 'shipped').length, active: status === 'shipped', onClick: () => setStatus('shipped') }]} /><div className="production-list shipping-preview-list">{visible.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} onOpen={() => open(shipment)} />)}</div></section>}</main>
    <nav className="shipping-preview-bottom" aria-label="Navigasi pratinjau"><span>Order</span><span>Produksi</span><span className="active"><Truck /> Kirim</span><span>Selesai</span></nav>
  </div>
}

function ShipmentCard({ shipment, onOpen }: { shipment: PreviewShipment; onOpen: () => void }) {
  const first = shipment.formulas[0]
  const additional = shipment.formulas.length - 1
  const detail = shipment.bundleLabel ? `Pratinjau ${first.name} - ${shipment.volumeMl} ml` : `${shipment.volumeMl} ml - ${shipment.quantity} botol`
  return <OperationsOrderCard className="shipping-preview-card"><OperationsOrderHeader orderNumber={shipment.orderNumber} time={shipment.orderedAt} status={statusCopy[shipment.status]} /><div className="shipping-preview-recipient"><strong>{shipment.recipient}</strong><span>{shipment.city} - {shipment.province}</span></div><div className="shipping-preview-product"><div><h2>{shipment.bundleLabel ?? first.name}</h2><p>{detail}</p></div><FormulaNotes formula={first.formula} title="Notes parfum" variant="compact" />{additional ? <small>+{additional} parfum lainnya</small> : null}</div><div className="shipping-preview-courier"><Truck aria-hidden="true" /><span>{shipment.courier} - {shipment.service}</span><strong>{formatPrice(shipment.total)}</strong></div><button className="shipping-preview-open" onClick={onOpen}>Lihat Detail <ChevronRight aria-hidden="true" /></button></OperationsOrderCard>
}

function ShipmentDetail({ shipment, role, onBack }: { shipment: PreviewShipment; role: 'vendor' | 'admin'; onBack: () => void }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const addressLines = [shipment.recipient, shipment.phone, shipment.address, `${shipment.city}, ${shipment.province}${shipment.postalCode ? ` ${shipment.postalCode}` : ''}`]
  const copyAddress = async () => {
    try { await navigator.clipboard.writeText(addressLines.join('\n')); setCopyStatus('copied') }
    catch { setCopyStatus('failed') }
  }
  return <section className="app-screen shipping-preview-detail"><button className="shipping-preview-back" onClick={onBack}><ArrowLeft /> Kembali ke Kirim</button><OperationsOrderHeader orderNumber={shipment.orderNumber} time={shipment.orderedAt} status={statusCopy[shipment.status]} /><section className="shipping-preview-detail-card"><h1>{shipment.bundleLabel ?? shipment.formulas[0].name}</h1><p>{shipment.bundleLabel ? `${shipment.formulas.length} parfum - ${shipment.volumeMl} ml masing-masing` : `${shipment.volumeMl} ml - ${shipment.quantity} botol`}</p>{shipment.formulas.map((item) => <section className="shipping-preview-blend" key={item.name}><h2>{item.name}</h2><p>{shipment.volumeMl} ml - {shipment.quantity} botol</p><FormulaNotes formula={item.formula} title="Top - Middle - Base" variant="compact" /></section>)}<strong className="shipping-preview-total">{formatPrice(shipment.total)}</strong></section><section className="shipping-preview-detail-card shipping-preview-address"><h2>Penerima & alamat</h2><p><strong>{shipment.recipient}</strong><br />{shipment.phone}<br />{shipment.address}<br />{shipment.city}, {shipment.province}{shipment.postalCode ? ` ${shipment.postalCode}` : ''}</p><div className="shipping-preview-address-actions"><button type="button" onClick={() => void copyAddress()}>Salin Alamat</button><button type="button" onClick={() => window.print()}>Cetak Alamat</button></div><small aria-live="polite">{copyStatus === 'copied' ? 'Alamat berhasil disalin.' : copyStatus === 'failed' ? 'Alamat belum dapat disalin. Coba lagi.' : null}</small></section><section className="shipping-preview-detail-card"><h2>Pengiriman</h2><p><strong>{shipment.courier} - {shipment.service}</strong>{shipment.trackingNumber ? <><br />Resi: {shipment.trackingNumber}</> : null}</p>{shipment.status === 'ready_to_ship' ? <><button className="orders-build" disabled>Tandai sedang dikirim</button><small>Pratinjau: aksi ini tetap memerlukan perubahan guard backend sebelum dapat diaktifkan.</small></> : <p className="shipping-preview-status"><PackageCheck /> Paket sudah diserahkan ke kurir.</p>}</section><p className="shipping-preview-role-note">Mode pratinjau: {role === 'vendor' ? 'Vendor hanya mengelola pengiriman yang ditugaskan.' : 'Admin memantau seluruh pengiriman dan mempertahankan otorisasi override server.'}</p><section className="shipping-preview-print-label" aria-hidden="true"><p>Perfun Lab</p><strong>Nomor pesanan: {shipment.orderNumber}</strong><h1>{shipment.recipient}</h1><p>{shipment.phone}</p><p>{shipment.address}<br />{shipment.city}, {shipment.province}{shipment.postalCode ? ` ${shipment.postalCode}` : ''}</p></section></section>
}

createRoot(document.getElementById('root')!).render(<StrictMode><ShippingWorkspacePreview /></StrictMode>)
