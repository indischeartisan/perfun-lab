import { ArrowLeft, PackageCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatPrice } from '../lib/currency'
import { getOrder, placeOrder, quoteOrder, type CustomerOrder, type OrderIntent, type OrderLine, type Quote } from '../lib/orders'
import { reviewedShippingBreakdown } from '../lib/shippingCheckoutReview'
import { checkoutErrorMessage, checkoutShippingMode, isShippingCheckoutEnabled, shippingQuoteRequired, type ShippingReadiness } from '../lib/shippingCheckout'
import { AddressBook, AddressText } from './AddressBook'
import { ShippingQuotePicker } from './ShippingQuotePicker'
import type { Address } from '../lib/orders'
import type { ShippingQuote } from '../lib/shipping'
import { getCheckoutShippingReadiness } from '../lib/shipping'
import { PaymentActions } from './PaymentActions'
import { isCheckoutPending } from '../lib/storageValidation'

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

export function CheckoutScreen({ userId, items, onBack, onPlaced }: { userId: string; items: OrderIntent[]; onBack: () => void; onPlaced: (order: CustomerOrder) => void }) {
  const storageKey = `perfun-order-submit:${userId}`
  const [pending, setPending] = useState<Pending | null>(() => readPending(storageKey, items))
  const [addressId, setAddressId] = useState(() => readPending(storageKey, items)?.addressId ?? '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null)
  const [address, setAddress] = useState<Address | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const itemsFingerprint = JSON.stringify(items)
  const previousItemsFingerprint = useRef(itemsFingerprint)
  const [shippingStatus, setShippingStatus] = useState<ShippingReadiness | null>(null)
  const [shippingStatusError, setShippingStatusError] = useState(false)
  const mode = shippingStatusError ? 'unavailable' : checkoutShippingMode(isShippingCheckoutEnabled(), shippingStatus)
  const shippingEnabled = mode === 'shipping'
  useEffect(() => {
    let active = true
    void getCheckoutShippingReadiness().then(status => { if (active) setShippingStatus(status) }).catch(() => { if (active) setShippingStatusError(true) })
    return () => { active = false }
  }, [])
  const selectAddress = useCallback((id: string) => { setAddressId(id); setAddress(null); setShippingQuote(null); setQuote(null); setError('') }, [])
  useEffect(() => {
    if (previousItemsFingerprint.current === itemsFingerprint) return
    previousItemsFingerprint.current = itemsFingerprint
    setShippingQuote(null); setQuote(null); setError('')
  }, [itemsFingerprint])
  useEffect(() => {
    const expiresAt = quote?.shipping_quote_snapshot?.expires_at ?? shippingQuote?.expires_at
    if (!quote || !expiresAt) return
    const deadline = Date.parse(expiresAt)
    const expire = () => { setShippingQuote(null); setQuote(null); setError('Your shipping quote expired. Select a service again.') }
    if (Number.isNaN(deadline) || deadline <= Date.now()) { expire(); return }
    const timer = window.setTimeout(expire, deadline - Date.now() + 1)
    return () => window.clearTimeout(timer)
  }, [quote, shippingQuote?.expires_at])
  async function review() {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { if (mode !== 'standard' && mode !== 'shipping') throw new Error('Shipping status unavailable. Please refresh and try again.'); if (shippingQuoteRequired(shippingEnabled, shippingQuote?.quote_id)) throw new Error('Choose a current shipping service before reviewing your order.'); setQuote(await quoteOrder(addressId, items, shippingQuote?.quote_id ?? null)) }
    catch (error) { setError(checkoutErrorMessage(error)); setQuote(null) }
    finally { locked.current = false; setBusy(false) }
  }
  async function submit() {
    if (locked.current || (!quote && !pending)) return
    locked.current = true; setBusy(true); setError('')
    const request = pending ?? { addressId, items, shippingQuoteId: shippingQuote?.quote_id ?? null, requestId: crypto.randomUUID(), token: quote!.quote_token }
    let committed = false
    try {
      savePending(storageKey, request); setPending(request)
      const id = await placeOrder(request.addressId, request.items, request.shippingQuoteId, request.requestId, request.token)
      committed = true
      const order = await getOrder(id)
      clearPending(storageKey); setPending(null); onPlaced(order)
    } catch (error) {
      setError(checkoutErrorMessage(error))
      // Only definitive database validation failures clear the intent. Network errors preserve it.
      if (!committed && error && typeof error === 'object' && 'code' in error && ['P0001', '42501', '23514', '22P02'].includes(String(error.code))) {
        clearPending(storageKey); setPending(null); setQuote(null)
      }
    } finally { locked.current = false; setBusy(false) }
  }
  return <section className="checkout-screen app-screen"><button className="checkout-back" disabled={busy || !!pending} onClick={onBack}><ArrowLeft/> Back to Bag</button><header className="screen-title"><span>CHECKOUT</span><h1>Almost yours.</h1><p>Choose your delivery address, then review your order.</p></header>
    {error ? <p className="cloud-message" role="alert">{error}</p> : null}
    {mode === 'update' ? <p role="alert">Pengiriman sudah tersedia. Perbarui aplikasi atau buka ulang halaman sebelum melanjutkan checkout.</p> : null}
    {mode === 'unavailable' ? <p role="alert">Status pengiriman belum tersedia. Muat ulang halaman dan coba lagi.</p> : null}
    {mode === 'loading' ? <p role="status">Memeriksa status pengiriman…</p> : null}
    {pending ? <div className="cloud-message"><p>Your order request is saved. Check its result safely without creating another order.</p><button disabled={busy} onClick={submit}>{busy ? 'Checking order…' : 'Check / retry order'}</button></div> : <div className="checkout-grid">
      {!quote ? <><AddressBook selectedId={addressId} onSelect={selectAddress} onAddressSelect={setAddress}/>{shippingEnabled ? <ShippingQuotePicker key={address?.id ?? 'no-address'} address={address} items={items} onQuote={setShippingQuote}/> : null}</> : <div className="guest-form"><h2>Deliver to</h2><AddressText address={quote.address_snapshot}/><button className="checkout-back" disabled={busy} onClick={() => { setShippingQuote(null); setQuote(null) }}>Change address</button></div>}
      <aside className="checkout-summary"><span>{quote ? 'REVIEW ORDER' : 'ORDER SUMMARY'}</span>{quote ? <><OrderLines items={quote.items}/><OrderTotals totals={quote}/><button disabled={busy} onClick={submit}>{busy ? 'CREATING ORDER…' : 'CREATE ORDER'}</button></> : <><p>{items.length} product selection{items.length === 1 ? '' : 's'} ready.</p><button disabled={!addressId || (mode !== 'standard' && mode !== 'shipping') || shippingQuoteRequired(shippingEnabled, shippingQuote?.quote_id) || busy} onClick={review}>{busy ? 'CALCULATING…' : 'REVIEW ORDER'}</button></>}<small>{shippingEnabled ? (shippingQuote ? 'Shipping is included in the total. Payment is not collected at this step.' : 'Choose an official destination and shipping service to continue.') : 'Shipping will be added when delivery service is available.'}</small></aside>
    </div>}
  </section>
}
export function OrderLines({ items }: { items: OrderLine[] }) {
  return <div className="checkout-items">{items.map((item, index) => <article key={index}><div><strong>{item.product_snapshot.label}</strong><small>{item.product_snapshot.bottle_count} × {item.product_snapshot.volume_ml} ml · Qty {item.quantity}</small>{item.creations_snapshot.map((creation, i) => <div className="snapshot-blend" key={i}><b>{creation.name}</b><small>{creation.notes.map(n => `${n.phase}: ${n.note.name}`).join(' · ')}</small></div>)}<small>Unit price {formatPrice(item.unit_price)}</small></div><b>{formatPrice(item.line_total)}</b></article>)}</div>
}
export function OrderTotals({ totals }: { totals: Pick<Quote, 'subtotal' | 'discount' | 'shipping' | 'grand_total'> & { shipping_quote_snapshot?: Quote['shipping_quote_snapshot'] | null } }) {
  const shipping = totals.shipping_quote_snapshot ? reviewedShippingBreakdown({ shipping: totals.shipping, shipping_quote_snapshot: totals.shipping_quote_snapshot }) : null
  const courier = shipping ? [shipping.courier_name || shipping.courier_code, shipping.service].filter(Boolean).join(' · ') : ''
  return <dl><div><dt>Subtotal</dt><dd>{formatPrice(totals.subtotal)}</dd></div><div><dt>Launch discount</dt><dd>−{formatPrice(totals.discount)}</dd></div>{shipping ? <><div className="shipping-service"><dt>Shipping {courier ? <small>{courier}</small> : null}</dt><dd>{formatPrice(shipping.original_shipping_amount)}</dd></div><div className="shipping-voucher"><dt>Shipping voucher</dt><dd>−{formatPrice(shipping.shipping_discount)}</dd></div><div className="shipping-customer-total"><dt>You pay for shipping</dt><dd>{formatPrice(shipping.customer_shipping_total)}</dd></div></> : <div><dt>Shipping</dt><dd>{formatPrice(totals.shipping)}</dd></div>}<div className="total"><dt>Grand total</dt><dd>{formatPrice(totals.grand_total)}</dd></div></dl>
}
export function ConfirmationScreen({ order, onBuild, onOrders }: { order: CustomerOrder; onBuild: () => void; onOrders: () => void }) {
  return <section className="confirmation-screen app-screen"><div className="confirmation-mark"><PackageCheck/></div><span>ORDER CONFIRMATION</span><h1>Order created.</h1><p>Thanks, {order.address_snapshot.recipient_name}. Your order is pending payment.</p><div className="confirmation-card"><strong>{order.order_number}</strong><span>Pending payment</span><span>Total · {formatPrice(order.grand_total)}</span><small>Complete payment to confirm your order.</small></div><PaymentActions order={order} onRefresh={onOrders}/><div className="confirmation-actions"><button onClick={onBuild}>MAKE ANOTHER BLEND</button><button onClick={onOrders}>VIEW ORDERS</button></div></section>
}
