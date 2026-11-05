/* eslint-disable react-refresh/only-export-components -- dedicated Vite E2E entrypoint */
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import '../styles.css'
import '../theme.css'
import '../checkout.css'
import { AddressBook } from '../components/AddressBook'
import { ShippingQuotePicker } from '../components/ShippingQuotePicker'
import { quoteOrder, type Address, type OrderIntent, type Quote } from '../lib/orders'
import type { ShippingQuote } from '../lib/shipping'
import { requireSupabase } from '../lib/supabase'

const items: OrderIntent[] = [{ product_id: '10ml', quantity: 1, formulas: [{ top: 'yuzu', middle: 'matcha', base: 'vanilla' }] }]
const email = import.meta.env.VITE_E2E_CUSTOMER_EMAIL
const password = import.meta.env.VITE_E2E_CUSTOMER_PASSWORD

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [addressId, setAddressId] = useState('')
  const [address, setAddress] = useState<Address | null>(null)
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null)
  const [review, setReview] = useState<Quote | null>(null)

  useEffect(() => {
    if (!email || !password) return
    requireSupabase().auth.signInWithPassword({ email, password })
      .then(({ error: signInError }) => { if (signInError) throw signInError; setReady(true) })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Sign in failed.'))
  }, [])

  async function reviewCheckout() {
    if (!address || !shippingQuote) return
    try { setError(''); setReview(await quoteOrder(address.id, items, shippingQuote.quote_id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Checkout review failed.') }
  }

  if (!email || !password) return <p data-testid="e2e-error">E2E credentials are missing.</p>
  if (error) return <p data-testid="e2e-error">{error}</p>
  if (!ready) return <p data-testid="e2e-auth">Signing in to local Supabase…</p>
  return <main className="customer-app"><section className="checkout-screen app-screen">
    <p data-testid="e2e-auth">Authenticated local customer</p>
    <AddressBook selectedId={addressId} onSelect={id => { setAddressId(id); setShippingQuote(null); setReview(null) }} onAddressSelect={next => { setAddress(next); setAddressId(next.id); setShippingQuote(null); setReview(null) }} destinationSearchEnabled/>
    {address ? <ShippingQuotePicker key={address.id} address={address} items={items} onQuote={setShippingQuote}/> : null}
    {shippingQuote ? <><output data-testid="quote-id">{shippingQuote.quote_id}</output><button type="button" data-testid="review-checkout" onClick={reviewCheckout}>Review checkout</button></> : null}
    {review ? <p data-testid="checkout-review">{JSON.stringify({ shipping: review.shipping, grand_total: review.grand_total, address: review.address_snapshot, quote: review.shipping_quote_snapshot })}</p> : null}
  </section></main>
}

createRoot(document.getElementById('root')!).render(<App/>)
