import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Copy, RefreshCw, Truck } from 'lucide-react'
import { listOrders, type CustomerOrder, type OrderLine } from '../lib/orders'
import { errorMessage } from '../lib/supabase'
import { formatPrice } from '../lib/currency'
import { AddressText } from '../components/AddressBook'
import { PaymentActions } from '../components/PaymentActions'
import { reviewedShippingBreakdown } from '../lib/shippingCheckoutReview'
import { getNoteStickerAsset } from '../lib/noteAssets'

type Filter = 'all' | 'unpaid' | 'processing' | 'shipping' | 'complete'
type Status = { label: string; detail: string; tone: 'amber' | 'lime' | 'blue' | 'green' | 'gray' }
type SnapshotNote = OrderLine['creations_snapshot'][number]['notes'][number]
type ProductSummary = { name: string; volumeMl: number; quantity: number; notes: SnapshotNote[] }

const filters: Array<[Filter, string]> = [['all', 'Semua'], ['unpaid', 'Belum Bayar'], ['processing', 'Diproses'], ['shipping', 'Dikirim'], ['complete', 'Selesai']]
const phases = ['top', 'middle', 'base'] as const

function orderStatus(order: CustomerOrder): Status {
  if (order.payment_status === 'pending') return { label: 'Belum dibayar', detail: 'Selesaikan pembayaran untuk memulai peracikan.', tone: 'amber' }
  if (order.payment_status === 'failed') return { label: 'Pembayaran gagal', detail: 'Coba pembayaran lagi saat Anda siap.', tone: 'amber' }
  if (order.payment_status === 'expired') return { label: 'Pembayaran kedaluwarsa', detail: 'Pesanan ini tidak dapat diproses.', tone: 'gray' }
  if (order.payment_status === 'refunded') return { label: 'Pembayaran dikembalikan', detail: 'Pesanan ini tidak diproses lebih lanjut.', tone: 'gray' }
  if (order.shipment?.status === 'delivered') return { label: 'Selesai', detail: 'Pesanan telah sampai.', tone: 'green' }
  if (order.shipment?.status === 'shipped') return { label: 'Dalam pengiriman', detail: 'Pesanan sedang menuju alamat Anda.', tone: 'blue' }
  if (order.shipment?.status === 'ready_to_ship') return { label: 'Siap dikirim', detail: 'Pesanan segera diserahkan ke kurir.', tone: 'lime' }
  if (['in_production', 'blending', 'processing'].includes(order.status)) return { label: 'Sedang diracik', detail: 'Parfum sedang diracik. Pengiriman disiapkan setelah proses ini selesai.', tone: 'lime' }
  return { label: 'Menunggu diracik', detail: 'Pembayaran telah diterima; pesanan segera masuk antrean.', tone: 'lime' }
}

function matches(order: CustomerOrder, filter: Filter) {
  const label = orderStatus(order).label
  return filter === 'all' || filter === 'unpaid' && label.includes('dibayar') || filter === 'processing' && ['Menunggu diracik', 'Sedang diracik', 'Siap dikirim'].includes(label) || filter === 'shipping' && label === 'Dalam pengiriman' || filter === 'complete' && label === 'Selesai'
}

function short(value: string) { return value.length > 17 ? `${value.slice(0, 12)}…${value.slice(-5)}` : value }
function date(value: string) { return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function normalizedPhase(value: string) { return value.trim().toLowerCase() }

function products(order: CustomerOrder): ProductSummary[] {
  return order.order_items.flatMap(item => {
    const creations = item.creations_snapshot.length ? item.creations_snapshot : [{ name: item.product_snapshot.label, notes: [] }]
    return creations.map(creation => ({ name: creation.name || item.product_snapshot.label, volumeMl: item.product_snapshot.volume_ml, quantity: item.quantity, notes: creation.notes }))
  })
}

function NoteTrio({ notes, compact = false }: { notes: SnapshotNote[]; compact?: boolean }) {
  return <div className={`customer-order-note-trio${compact ? ' compact' : ''}`} aria-label="Komposisi notes parfum">
    {phases.map(phase => {
      const item = notes.find(note => normalizedPhase(note.phase) === phase)
      const asset = item ? getNoteStickerAsset(item.note) : null
      return <div className="customer-order-note" key={phase}>
        <span>{phase}</span>
        {asset ? <img src={asset} alt="" loading="lazy" /> : <i aria-hidden="true" />}
        <strong>{item?.note.name ?? 'Belum tersedia'}</strong>
      </div>
    })}
  </div>
}

export function OrdersPage({ userId, onLogin, onBuild }: { userId?: string; onLogin: () => void; onBuild: () => void }) {
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<CustomerOrder | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const refresh = useCallback(() => {
    if (!userId || inflight.current) return inflight.current ?? Promise.resolve()
    setLoading(true)
    const request = listOrders().then(rows => { setOrders(rows); setError('') }).catch(cause => setError(errorMessage(cause))).finally(() => { setLoading(false); inflight.current = null })
    inflight.current = request
    return request
  }, [userId])
  useEffect(() => { if (userId) void refresh() }, [userId, refresh])
  if (!userId) return <section className="app-screen"><div className="screen-empty"><h2>Masuk untuk melihat pesanan</h2><button onClick={onLogin}>Masuk</button></div></section>
  if (selected) return <CustomerOrderDetail order={selected} onBack={() => setSelected(null)} onRefresh={() => void refresh()} />
  const visible = orders.filter(order => matches(order, filter))
  return <section className="app-screen customer-orders-page">
    <header className="customer-orders-heading"><span>AKUN SAYA</span><div><h1>Pesanan Saya.</h1><button className="customer-orders-refresh" disabled={loading} onClick={() => void refresh()}><RefreshCw /> {loading ? 'Memuat' : 'Perbarui'}</button></div><p>Lihat dan kelola semua pesanan parfummu di sini.</p></header>
    <nav className="customer-order-filters" aria-label="Filter pesanan">{filters.map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</nav>
    {error ? <p className="cloud-message" role="alert">{error} <button onClick={() => void refresh()}>Coba lagi</button></p> : null}
    {loading && !orders.length ? <p role="status">Menyiapkan pesananmu…</p> : null}
    {!loading && !orders.length ? <div className="screen-empty"><h2>Belum ada pesanan</h2><button onClick={onBuild}>Racik parfum</button></div> : null}
    <div className="customer-order-list">{visible.map(order => <CustomerOrderCard key={order.id} order={order} onOpen={() => setSelected(order)} />)}</div>
    {!loading && orders.length && !visible.length ? <p className="customer-orders-no-match">Tidak ada pesanan dalam filter ini.</p> : null}
  </section>
}

export function CustomerOrderCard({ order, onOpen }: { order: CustomerOrder; onOpen: () => void }) {
  const status = orderStatus(order), orderProducts = products(order), first = orderProducts[0], additional = Math.max(0, orderProducts.length - 1)
  return <article className="customer-order-card"><button className="customer-order-card-link" type="button" onClick={onOpen} aria-label={`Lihat detail pesanan ${order.order_number}`}>
    <header className="customer-order-card-header"><div><time>{date(order.created_at)}</time><strong title={order.order_number}>{short(order.order_number)}</strong></div><span className={`customer-order-status ${status.tone}`}>{status.label}</span></header>
    <div className="customer-order-card-body"><div className="customer-order-card-product"><div><h2>{first?.name ?? 'Parfum'}</h2><p>{first ? `${first.volumeMl} ml · ${first.quantity} botol` : ''}</p></div>{first ? <NoteTrio notes={first.notes} compact /> : null}{additional ? <small className="customer-order-more-items">+{additional} parfum lainnya</small> : null}</div><div className="customer-order-card-action"><strong className="customer-order-total">{formatPrice(order.grand_total)}</strong><span>Lihat detail <ChevronRight aria-hidden="true" /></span></div></div>
  </button></article>
}

export function CustomerOrderDetail({ order, onBack, onRefresh }: { order: CustomerOrder; onBack: () => void; onRefresh: () => void }) {
  const status = orderStatus(order), [copied, setCopied] = useState(false), shipping = order.shipping_quote_snapshot ? reviewedShippingBreakdown({ shipping: order.shipping, shipping_quote_snapshot: order.shipping_quote_snapshot }) : null, orderProducts = products(order)
  return <section className="app-screen customer-order-detail">
    <header className="customer-order-detail-title"><button aria-label="Kembali" onClick={onBack}><ArrowLeft /></button><h1>Detail Pesanan</h1></header>
    <article className="customer-order-detail-card"><header className="customer-order-card-header"><div><time>{date(order.created_at)}</time><strong title={order.order_number}>{short(order.order_number)}</strong></div><span className={`customer-order-status ${status.tone}`}>{status.label}</span></header><p className="customer-order-status-copy">{status.detail}</p><div className="customer-order-detail-products">{orderProducts.map((item, index) => <article className="customer-order-detail-item" key={`${item.name}-${index}`}><div className="customer-order-detail-product-copy"><h2>{item.name}</h2><p>{item.volumeMl} ml · {item.quantity} botol</p></div><NoteTrio notes={item.notes} /></article>)}</div></article>
    <h2>Rincian Pembayaran</h2><section className="customer-order-payment-detail"><dl><div><dt>Subtotal produk</dt><dd>{formatPrice(order.subtotal)}</dd></div>{order.discount > 0 ? <div><dt>Diskon peluncuran</dt><dd>−{formatPrice(order.discount)}</dd></div> : null}<div><dt>Ongkir setelah voucher</dt><dd>{formatPrice(shipping?.customer_shipping_total ?? order.shipping)}</dd></div><div className="total"><dt>Total pembayaran</dt><dd>{formatPrice(order.grand_total)}</dd></div></dl></section>
    <h2>Pengiriman</h2><section className="customer-order-shipping"><Truck /><div><strong>{order.shipment ? `${order.shipment.courier} · ${order.shipment.service}` : 'Pengiriman belum dijadwalkan'}</strong><p>{order.shipment?.tracking_number ? `Resi: ${order.shipment.tracking_number}` : status.label === 'Sedang diracik' ? 'Pengiriman akan disiapkan setelah parfum selesai diracik.' : status.label}</p></div></section>
    <h2>Alamat Pengiriman</h2><section className="customer-order-address"><AddressText address={order.address_snapshot} /></section>{order.payment_status === 'pending' ? <PaymentActions order={order} onRefresh={onRefresh} /> : null}<button className="customer-order-copy" onClick={() => navigator.clipboard.writeText(order.order_number).then(() => setCopied(true)).catch(() => setCopied(false))}><Copy /> {copied ? 'Nomor tersalin' : 'Salin nomor pesanan lengkap'}</button>
  </section>
}
