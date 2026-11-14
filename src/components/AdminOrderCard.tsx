import type { AdminOrder } from '../lib/admin'
import { formatPrice } from '../lib/currency'
import { getNoteStickerAsset } from '../lib/noteAssets'

function processStatus(order: AdminOrder) {
  if (order.payment_status === 'pending') return 'Menunggu pembayaran'
  if (order.shipment_status === 'delivered') return 'Selesai'
  if (order.shipment_status === 'shipped') return 'Sedang dikirim'
  if (order.shipment_status === 'ready_to_ship') return 'Siap dikirim'
  if (order.production_status === 'in_production') return 'Sedang diracik'
  if (order.production_status === 'queued') return 'Antrean produksi'
  return 'Menunggu diracik'
}

function shortOrderNumber(value: string) { return value.length > 17 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value }
function usableLabel(value: string) { return Boolean(value.trim()) && !/^\d+\s*ml$/i.test(value.trim()) }

function Notes({ notes }: { notes?: Array<{ phase: string; id?: string; name: string }> }) {
  if (!notes?.length) return <p className="admin-order-detail-missing">Detail racikan belum tersedia</p>
  return <div className="admin-order-notes">{(['top', 'middle', 'base'] as const).map(phase => { const note = notes.find(item => item.phase.toLowerCase() === phase); const asset = note?.id ? getNoteStickerAsset({ id: note.id }) : null; return <div key={phase}>{asset ? <img src={asset} alt=""/> : null}<strong>{note?.name ?? 'Detail racikan belum tersedia'}</strong></div> })}</div>
}

function Product({ product }: { product: AdminOrder['products'][number] }) {
  const title = product.bottle_count === 3 ? 'Play Set · Bundel 3 × 10 ml' : usableLabel(product.label) ? product.label : null
  const blends = product.blends?.length ? product.blends : [{ label: title, notes: product.notes }]
  return <section className="admin-order-product">{blends.length > 1 ? blends.map((blend, index) => <div className="admin-order-blend" key={`${blend.label ?? title ?? 'parfum'}-${index}`}><strong className="admin-order-blend-label">Parfum {index + 1}</strong><div className="admin-order-product-heading"><strong>{blend.label ?? 'Racikan parfum'}</strong><span>{product.volume_ml} ml · Jumlah {product.quantity}</span></div><Notes notes={blend.notes}/></div>) : <><div className="admin-order-product-heading"><strong>{title ?? 'Racikan parfum'}</strong><span>{product.volume_ml} ml · Jumlah {product.quantity}</span></div><Notes notes={product.notes}/></>}</section>
}

export function AdminOrderCard({ order, onDetail }: { order: AdminOrder; onDetail?: () => void }) {
  const status = processStatus(order)
  return <article className="admin-order-card"><header><div><strong title={order.order_number}>{shortOrderNumber(order.order_number)}</strong><span>{order.customer.name || order.customer.email || 'Pemesan belum tersedia'}</span><time>{new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><b className={`admin-process-status ${order.shipment_status === 'delivered' ? 'complete' : order.production_status === 'in_production' ? 'production' : 'default'}`}>{status}</b></header><div className="admin-order-products">{order.products.map((product, index) => <Product key={`${product.label}-${index}`} product={product}/>)}</div><footer><span>Total <strong>{formatPrice(order.grand_total)}</strong></span>{onDetail ? <button type="button" onClick={onDetail}>Lihat detail →</button> : null}</footer></article>
}
