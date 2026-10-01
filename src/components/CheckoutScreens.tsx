import { ArrowLeft, PackageCheck } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { formatPrice } from '../lib/currency'
import { getOrder, placeOrder, quoteOrder, type CustomerOrder, type OrderIntent, type OrderLine, type Quote } from '../lib/orders'
import { errorMessage } from '../lib/supabase'
import { AddressBook, AddressText } from './AddressBook'
import { PaymentActions } from './PaymentActions'

interface Pending { addressId: string; items: OrderIntent[]; requestId: string; token: string }
function readPending(key: string): Pending | null { try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') } catch { return null } }

export function CheckoutScreen({ userId, items, onBack, onPlaced }: { userId: string; items: OrderIntent[]; onBack: () => void; onPlaced: (order: CustomerOrder) => void }) {
  const storageKey = `perfun-order-submit:${userId}`
  const [pending, setPending] = useState<Pending | null>(() => readPending(storageKey))
  const [addressId, setAddressId] = useState(() => readPending(storageKey)?.addressId ?? '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const selectAddress = useCallback((id: string) => { setAddressId(id); setQuote(null); setError('') }, [])
  async function review() {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { setQuote(await quoteOrder(addressId, items)) }
    catch (error) { setError(errorMessage(error)); setQuote(null) }
    finally { locked.current = false; setBusy(false) }
  }
  async function submit() {
    if (locked.current || (!quote && !pending)) return
    locked.current = true; setBusy(true); setError('')
    const request = pending ?? { addressId, items, requestId: crypto.randomUUID(), token: quote!.quote_token }
    let committed = false
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request)); setPending(request)
      const id = await placeOrder(request.addressId, request.items, request.requestId, request.token)
      committed = true
      const order = await getOrder(id)
      sessionStorage.removeItem(storageKey); setPending(null); onPlaced(order)
    } catch (error) {
      setError(errorMessage(error))
      // Only definitive database validation failures clear the intent. Network errors preserve it.
      if (!committed && error && typeof error === 'object' && 'code' in error && ['P0001', '42501', '23514', '22P02'].includes(String(error.code))) {
        sessionStorage.removeItem(storageKey); setPending(null); setQuote(null)
      }
    } finally { locked.current = false; setBusy(false) }
  }
  return <section className="checkout-screen app-screen"><button className="checkout-back" disabled={busy || !!pending} onClick={onBack}><ArrowLeft/> Back to Bag</button><header className="screen-title"><span>CHECKOUT</span><h1>Almost yours.</h1><p>Choose your delivery address, then review your order.</p></header>
    {error ? <p className="cloud-message" role="alert">{error}</p> : null}
    {pending ? <div className="cloud-message"><p>Your order request is saved. Check its result safely without creating another order.</p><button disabled={busy} onClick={submit}>{busy ? 'Checking order…' : 'Check / retry order'}</button></div> : <div className="checkout-grid">
      {!quote ? <AddressBook selectedId={addressId} onSelect={selectAddress}/> : <div className="guest-form"><h2>Deliver to</h2><AddressText address={quote.address_snapshot}/><button className="checkout-back" disabled={busy} onClick={() => setQuote(null)}>Change address</button></div>}
      <aside className="checkout-summary"><span>{quote ? 'REVIEW ORDER' : 'ORDER SUMMARY'}</span>{quote ? <><OrderLines items={quote.items}/><OrderTotals totals={quote}/><button disabled={busy} onClick={submit}>{busy ? 'CREATING ORDER…' : 'CREATE ORDER'}</button></> : <><p>{items.length} product selection{items.length === 1 ? '' : 's'} ready.</p><button disabled={!addressId || busy} onClick={review}>{busy ? 'CALCULATING…' : 'REVIEW ORDER'}</button></>}<small>Shipping Rp0 for now. Payment is not collected at this step.</small></aside>
    </div>}
  </section>
}
export function OrderLines({ items }: { items: OrderLine[] }) {
  return <div className="checkout-items">{items.map((item, index) => <article key={index}><div><strong>{item.product_snapshot.label}</strong><small>{item.product_snapshot.bottle_count} × {item.product_snapshot.volume_ml} ml · Qty {item.quantity}</small>{item.creations_snapshot.map((creation, i) => <div className="snapshot-blend" key={i}><b>{creation.name}</b><small>{creation.notes.map(n => `${n.phase}: ${n.note.name}`).join(' · ')}</small></div>)}<small>Unit price {formatPrice(item.unit_price)}</small></div><b>{formatPrice(item.line_total)}</b></article>)}</div>
}
export function OrderTotals({ totals }: { totals: Pick<Quote, 'subtotal' | 'discount' | 'shipping' | 'grand_total'> }) {
  return <dl><div><dt>Subtotal</dt><dd>{formatPrice(totals.subtotal)}</dd></div><div><dt>Launch discount</dt><dd>−{formatPrice(totals.discount)}</dd></div><div><dt>Shipping</dt><dd>{formatPrice(totals.shipping)}</dd></div><div className="total"><dt>Grand total</dt><dd>{formatPrice(totals.grand_total)}</dd></div></dl>
}
export function ConfirmationScreen({ order, onBuild, onOrders }: { order: CustomerOrder; onBuild: () => void; onOrders: () => void }) {
  return <section className="confirmation-screen app-screen"><div className="confirmation-mark"><PackageCheck/></div><span>ORDER CONFIRMATION</span><h1>Order created.</h1><p>Thanks, {order.address_snapshot.recipient_name}. Your order is pending payment.</p><div className="confirmation-card"><strong>{order.order_number}</strong><span>Pending payment</span><span>Total · {formatPrice(order.grand_total)}</span><small>Complete payment to confirm your order.</small></div><PaymentActions order={order} onRefresh={onOrders}/><div className="confirmation-actions"><button onClick={onBuild}>MAKE ANOTHER BLEND</button><button onClick={onOrders}>VIEW ORDERS</button></div></section>
}
