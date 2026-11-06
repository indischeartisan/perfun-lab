import { ArrowLeft, PackageCheck, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatPrice } from '../lib/currency'
import { getOrder, placeOrder, quoteOrder, type CustomerOrder, type OrderIntent, type OrderLine, type Quote } from '../lib/orders'
import { reviewedShippingBreakdown } from '../lib/shippingCheckoutReview'
import { checkoutErrorMessage, checkoutShippingMode, isShippingCheckoutEnabled, shippingUnavailable, type ShippingReadiness } from '../lib/shippingCheckout'
import { canSubmitReviewedOrder, shouldAutoReview } from '../lib/checkoutReviewState'
import { checkoutProductSummaries } from '../lib/checkoutProductSummary'
import { AddressBook, AddressText } from './AddressBook'
import { ShippingQuotePicker } from './ShippingQuotePicker'
import type { Address } from '../lib/orders'
import type { ShippingQuote } from '../lib/shipping'
import { getCheckoutShippingReadiness } from '../lib/shipping'
import { PaymentActions } from './PaymentActions'
import { isCheckoutPending } from '../lib/storageValidation'
import { createShippingQuoteOwnerGate } from '../lib/shippingAddressState'
import type { Catalog } from '../lib/catalog'

interface Pending { addressId: string; items: OrderIntent[]; shippingQuoteId: string | null; requestId: string; token: string }
function clearPending(key: string) { try { sessionStorage.removeItem(key) } catch { /* Storage is optional. */ } }
function savePending(key: string, value: Pending) { try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* The request can still continue in memory. */ } }
function readPending(key: string, expectedItems: OrderIntent[]): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (isCheckoutPending(value) && JSON.stringify(value.items) === JSON.stringify(expectedItems)) return value
    clearPending(key)
    return null
  } catch {
    clearPending(key)
    return null
  }
}

export function CheckoutScreen({ userId, items, catalog, onBack, onPlaced }: { userId: string; items: OrderIntent[]; catalog: Catalog; onBack: () => void; onPlaced: (order: CustomerOrder) => void }) {
  const storageKey = `perfun-order-submit:${userId}`
  const [storedPending, setStoredPending] = useState<Pending | null>(() => readPending(storageKey, items))
  const [addressId, setAddressId] = useState(() => readPending(storageKey, items)?.addressId ?? '')
  const [addressRevision, setAddressRevision] = useState(0)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null)
  const [address, setAddress] = useState<Address | null>(null)
  const [addressSheetOpen, setAddressSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewAttempt, setReviewAttempt] = useState(0)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const reviewRequest = useRef(0)
  const itemsFingerprint = JSON.stringify(items)
  const quoteOwner = useRef(createShippingQuoteOwnerGate(itemsFingerprint))
  const [shippingStatus, setShippingStatus] = useState<ShippingReadiness | null>(null)
  const [shippingStatusError, setShippingStatusError] = useState(false)
  const mode = shippingStatusError ? 'unavailable' : checkoutShippingMode(isShippingCheckoutEnabled(), shippingStatus)
  const shippingEnabled = mode === 'shipping'
  const pending = mode === 'paused' ? null : storedPending
  useEffect(() => {
    let active = true
    void getCheckoutShippingReadiness().then(status => { if (active) setShippingStatus(status) }).catch(() => { if (active) setShippingStatusError(true) })
    return () => { active = false }
  }, [])
  const selectAddress = useCallback((id: string) => { const revision = quoteOwner.current.nextAddress(); reviewRequest.current += 1; setAddressId(id); setAddressRevision(revision); setAddress(null); setShippingQuote(null); setQuote(null); setReviewBusy(false); setError(''); setAddressSheetOpen(false) }, [])
  const acceptShippingQuote = useCallback((next: ShippingQuote | null) => {
    if (!quoteOwner.current.accepts(addressRevision, itemsFingerprint)) return
    reviewRequest.current += 1
    setShippingQuote(next); setQuote(null); setReviewBusy(false); setError('')
  }, [addressRevision, itemsFingerprint])
  useLayoutEffect(() => {
    const revision = quoteOwner.current.updateItems(itemsFingerprint)
    if (revision === null) return
    reviewRequest.current += 1
    setAddressRevision(revision)
    setShippingQuote(null); setQuote(null); setReviewBusy(false); setError('')
  }, [itemsFingerprint])
  useEffect(() => {
    const expiresAt = quote?.shipping_quote_snapshot?.expires_at ?? shippingQuote?.expires_at
    if (!expiresAt) return
    const deadline = Date.parse(expiresAt)
    const expire = () => { reviewRequest.current += 1; setShippingQuote(null); setQuote(null); setReviewBusy(false); setError('Quote ongkir kedaluwarsa. Hitung ulang sebelum membuat pesanan.') }
    if (Number.isNaN(deadline) || deadline <= Date.now()) { expire(); return }
    const timer = window.setTimeout(expire, deadline - Date.now() + 1)
    return () => window.clearTimeout(timer)
  }, [quote, shippingQuote?.expires_at])
  useEffect(() => {
    const shippingQuoteId = shippingQuote?.quote_id
    if (!shippingQuoteId || !shouldAutoReview(mode, addressId, shippingQuoteId)) return
    const revision = addressRevision
    const request = ++reviewRequest.current
    const timer = window.setTimeout(() => {
      setReviewBusy(true); setError(''); setQuote(null)
      void quoteOrder(addressId, items, shippingQuoteId)
        .then(next => { if (request === reviewRequest.current && quoteOwner.current.accepts(revision, itemsFingerprint)) setQuote(next) })
        .catch(cause => { if (request === reviewRequest.current) { setQuote(null); setError(checkoutErrorMessage(cause)) } })
        .finally(() => { if (request === reviewRequest.current) setReviewBusy(false) })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [addressId, addressRevision, items, itemsFingerprint, mode, reviewAttempt, shippingQuote?.quote_id])
  async function submit() {
    if (locked.current || (!quote && !pending)) return
    locked.current = true; setBusy(true); setError('')
    const request = pending ?? { addressId, items, shippingQuoteId: shippingQuote?.quote_id ?? null, requestId: crypto.randomUUID(), token: quote!.quote_token }
    let committed = false
    try {
      savePending(storageKey, request); setStoredPending(request)
      const id = await placeOrder(request.addressId, request.items, request.shippingQuoteId, request.requestId, request.token)
      committed = true
      const order = await getOrder(id)
      clearPending(storageKey); setStoredPending(null); onPlaced(order)
    } catch (error) {
      setError(checkoutErrorMessage(error))
      // Only definitive database validation failures clear the intent. Network errors preserve it.
      if (!committed && error && typeof error === 'object' && 'code' in error && ['P0001', '42501', '23514', '22P02'].includes(String(error.code))) {
        clearPending(storageKey); setStoredPending(null); setQuote(null)
      }
    } finally { locked.current = false; setBusy(false) }
  }
  return <section className="checkout-screen app-screen"><button className="checkout-back" disabled={busy || !!pending} onClick={onBack}><ArrowLeft/> Kembali ke keranjang</button><header className="screen-title"><span>CHECKOUT</span><h1>Hampir jadi.</h1><p>Alamat utama dan ongkir terbaik akan disiapkan otomatis.</p></header>
    {error ? <p className="cloud-message" role="alert">{error}</p> : null}
    {mode === 'update' ? <p role="alert">Pengiriman sudah tersedia. Perbarui aplikasi atau buka ulang halaman sebelum melanjutkan checkout.</p> : null}
    {mode === 'unavailable' ? <p role="alert">Status pengiriman belum tersedia. Muat ulang halaman dan coba lagi.</p> : null}
    {mode === 'paused' ? <div className="checkout-unified-flow"><CheckoutAddressCard address={address} onChange={() => setAddressSheetOpen(true)}/><section className="checkout-section"><span>RINGKASAN PESANAN</span><CheckoutProductPreview items={items} catalog={catalog}/><p>Harga produk ditampilkan dari katalog saat ini. Harga final, diskon, dan total tetap menunggu validasi server setelah ongkir tersedia.</p></section><section className="checkout-section"><span>PENGIRIMAN</span><p>{shippingUnavailable}</p></section><aside className="checkout-summary"><span>TOTAL PESANAN</span><p>Harga akhir akan tersedia setelah ongkir dapat dihitung.</p><small>Anda tetap dapat menambah atau mengubah alamat pengiriman.</small></aside></div> : null}
    {mode === 'loading' ? <p role="status">Memeriksa status pengiriman…</p> : null}
    {mode === 'paused' ? null : pending ? <div className="cloud-message"><p>Permintaan pesanan tersimpan. Periksa hasilnya tanpa membuat pesanan kedua.</p><button disabled={busy} onClick={submit}>{busy ? 'Memeriksa pesanan…' : 'Periksa / coba lagi'}</button></div> : <div className="checkout-unified-flow">
      {mode === 'shipping' ? <><CheckoutAddressCard address={address} onChange={() => setAddressSheetOpen(true)}/><section className="checkout-section"><span>RINGKASAN PESANAN</span>{quote ? <OrderLines items={quote.items}/> : <p role="status">Menyiapkan ringkasan pesanan…</p>}</section>{shippingEnabled ? <ShippingQuotePicker key={`${address?.id ?? 'no-address'}:${addressRevision}:${itemsFingerprint}`} address={address} items={items} onQuote={acceptShippingQuote}/> : null}<aside className="checkout-summary"><span>TOTAL PESANAN</span>{quote ? <OrderTotals totals={quote}/> : <p>{reviewBusy ? 'Memvalidasi harga akhir…' : shippingQuote ? 'Menyiapkan total pesanan…' : 'Menunggu ongkir untuk menghitung total.'}</p>}<button disabled={!canSubmitReviewedOrder(mode, quote?.quote_token, busy, reviewBusy)} onClick={submit}>{busy ? 'Membuat pesanan…' : 'Buat pesanan'}</button><small>{quote ? 'Harga dan ongkir telah divalidasi. Pembayaran belum dilakukan pada tahap ini.' : 'Buat Pesanan tersedia setelah harga akhir tervalidasi.'}</small>{error && shippingQuote && !reviewBusy ? <button type="button" className="checkout-retry" onClick={() => setReviewAttempt(value => value + 1)}>Coba lagi</button> : null}</aside></> : null}
    </div>}
    <AddressBook hidden selectedId={addressId} onSelect={selectAddress} onAddressSelect={setAddress} destinationSearchEnabled/>
    {addressSheetOpen ? <div className="checkout-address-sheet-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setAddressSheetOpen(false) }}><section className="checkout-address-sheet" role="dialog" aria-modal="true" aria-labelledby="checkout-address-sheet-title"><header><div><span>ALAMAT PENGIRIMAN</span><h2 id="checkout-address-sheet-title">Ganti alamat</h2></div><button type="button" aria-label="Tutup" onClick={() => setAddressSheetOpen(false)}><X/></button></header><AddressBook selectedId={addressId} onSelect={selectAddress} onAddressSelect={setAddress} destinationSearchEnabled/></section></div> : null}
  </section>
}

function CheckoutAddressCard({ address, onChange }: { address: Address | null; onChange: () => void }) {
  return <section className="checkout-address-card"><header><div><span>ALAMAT PENGIRIMAN</span><h2>{address ? address.label || 'Alamat pengiriman' : 'Pilih alamat'}</h2></div><button type="button" onClick={onChange}>{address ? 'Ganti alamat' : 'Tambah alamat'}</button></header>{address ? <AddressText address={address}/> : <p>Alamat utama yang valid akan dipilih otomatis.</p>}</section>
}
function CheckoutProductPreview({ items, catalog }: { items: OrderIntent[]; catalog: Catalog }) {
  return <div className="checkout-items checkout-product-preview">{checkoutProductSummaries(items, catalog).map((item, index) => <article key={`${item.productId}:${index}`}><div className="checkout-item-copy"><small className="checkout-product-format">{item.label} · {item.bottleCount} × {item.volumeMl} ml · Jumlah {item.quantity}</small>{item.blends.map((blend, blendIndex) => <div className="snapshot-blend" key={blendIndex}><strong>{blend.label}</strong><small>{blend.notes.map(note => `${note.phase}: ${note.name}`).join(' · ')}</small></div>)}</div><div className="checkout-line-price">{item.price ? <>{item.price.discount > 0 ? <s>{formatPrice(item.price.normal)}</s> : null}<small>{item.price.discount > 0 ? 'Harga peluncuran' : 'Harga produk'}</small><strong>{formatPrice(item.price.opening)}</strong></> : <small>Harga produk akan dikonfirmasi saat checkout tersedia.</small>}</div></article>)}</div>
}
export function OrderLines({ items }: { items: OrderLine[] }) {
  return <div className="checkout-items">{items.map((item, index) => <article key={index}><div className="checkout-item-copy"><small className="checkout-product-format">{item.product_snapshot.label} · {item.product_snapshot.bottle_count} × {item.product_snapshot.volume_ml} ml · Jumlah {item.quantity}</small>{item.creations_snapshot.map((creation, i) => <div className="snapshot-blend" key={i}><strong>{creation.name}</strong><small>{creation.notes.map(n => `${n.phase}: ${n.note.name}`).join(' · ')}</small></div>)}</div><div className="checkout-line-price">{item.normal_unit_price > item.unit_price ? <s>{formatPrice(item.normal_unit_price * item.quantity)}</s> : null}<small>{item.normal_unit_price > item.unit_price ? 'Harga peluncuran' : 'Harga produk'}</small><strong>{formatPrice(item.line_total)}</strong></div></article>)}</div>
}
export function OrderTotals({ totals }: { totals: Pick<Quote, 'subtotal' | 'discount' | 'shipping' | 'grand_total'> & { shipping_quote_snapshot?: Quote['shipping_quote_snapshot'] | null } }) {
  const shipping = totals.shipping_quote_snapshot ? reviewedShippingBreakdown({ shipping: totals.shipping, shipping_quote_snapshot: totals.shipping_quote_snapshot }) : null
  return <dl><div><dt>Subtotal produk</dt><dd>{formatPrice(totals.subtotal)}</dd></div><div><dt>Diskon peluncuran</dt><dd>−{formatPrice(totals.discount)}</dd></div>{shipping ? <div className="shipping-customer-total"><dt>Ongkir setelah voucher</dt><dd>{formatPrice(shipping.customer_shipping_total)}</dd></div> : <div><dt>Ongkir</dt><dd>{formatPrice(totals.shipping)}</dd></div>}<div className="total"><dt>Total pesanan</dt><dd>{formatPrice(totals.grand_total)}</dd></div></dl>
}
export function ConfirmationScreen({ order, onBuild, onOrders }: { order: CustomerOrder; onBuild: () => void; onOrders: () => void }) {
  return <section className="confirmation-screen app-screen"><div className="confirmation-mark"><PackageCheck/></div><span>PESANAN DIBUAT</span><h1>Siap dibayar.</h1><p>Terima kasih, {order.address_snapshot.recipient_name}. Pesanan Anda menunggu pembayaran.</p><div className="confirmation-card"><strong>{order.order_number}</strong><span>Menunggu pembayaran</span><span>Total · {formatPrice(order.grand_total)}</span><small>Lanjutkan ke DOKU untuk menyelesaikan pembayaran dengan aman.</small></div><PaymentActions order={order} onRefresh={onOrders}/><div className="confirmation-actions"><button onClick={onBuild}>RACIK LAGI</button><button onClick={onOrders}>LIHAT PESANAN</button></div></section>
}
