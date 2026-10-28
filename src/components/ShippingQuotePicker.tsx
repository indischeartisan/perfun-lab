import { useEffect, useState } from 'react'
import type { Address, OrderIntent } from '../lib/orders'
import { bindShippingDestination, quoteExpired, searchShippingDestinations, selectShippingRate, shippingRates, type ShippingDestination, type ShippingQuote, type ShippingRate } from '../lib/shipping'
import { errorMessage } from '../lib/supabase'
import { formatPrice } from '../lib/currency'

export function ShippingQuotePicker({ address, items, onQuote }: { address: Address | null; items: OrderIntent[]; onQuote: (quote: ShippingQuote | null) => void }) {
  const [search, setSearch] = useState('')
  const [destinations, setDestinations] = useState<ShippingDestination[]>([])
  const [bound, setBound] = useState(() => Boolean(address?.rajaongkir_destination_id))
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<ShippingQuote | null>(null)
  const [selected, setSelected] = useState('')
  const [clock, setClock] = useState<number | null>(null)
  useEffect(() => { if (!quote) return; const timer = window.setInterval(() => setClock(Date.now()), 10_000); return () => window.clearInterval(timer) }, [quote])
  useEffect(() => {
    if (search.trim().length < 3 || bound) return
    const timer = window.setTimeout(() => {
      setBusy(true); setError('')
      searchShippingDestinations(search.trim()).then(setDestinations).catch(error => setError(errorMessage(error))).finally(() => setBusy(false))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [search, bound])
  const expired = quote ? quoteExpired(quote, clock ?? 0) : false
  const visibleDestinations = search.trim().length >= 3 && !bound ? destinations : []
  async function chooseDestination(destination: ShippingDestination) {
    if (!address || busy) return
    setBusy(true); setError('')
    try { await bindShippingDestination(address.id, search.trim(), destination.id); setBound(true); setDestinations([]) }
    catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  async function loadRates() {
    if (!address || !bound || busy) return
    setBusy(true); setError(''); setQuote(null); onQuote(null)
    try { const next = await shippingRates(address.id, items); setRates(next) }
    catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  async function chooseRate(rate: ShippingRate) {
    if (!address || busy) return
    setBusy(true); setError(''); setSelected(`${rate.courier_code}:${rate.service}`)
    try { const next = await selectShippingRate(address.id, items, rate.service); setClock(Date.parse(next.expires_at) - 600_000); setQuote(next); onQuote(next) }
    catch (error) { setSelected(''); setQuote(null); onQuote(null); setError(errorMessage(error)) } finally { setBusy(false) }
  }
  if (!address) return <section className="shipping-picker"><h2>Shipping</h2><p>Select a delivery address first.</p></section>
  return <section className="shipping-picker" aria-busy={busy}><h2>Shipping</h2>
    {error ? <p role="alert" className="shipping-error">{error}</p> : null}
    {!bound ? <><p>Search and select the official RajaOngkir destination for this address.</p><label className="shipping-search"><span>District, city, or postal code</span><input value={search} onChange={event => setSearch(event.target.value)} minLength={3} placeholder="e.g. Tigaraksa 15720" disabled={busy}/></label>{search.length >= 3 && !busy && !visibleDestinations.length && !error ? <p>No destination found. Refine your search.</p> : null}<div className="shipping-destinations">{visibleDestinations.map(destination => <button type="button" key={destination.id} disabled={busy} onClick={() => chooseDestination(destination)}><b>{destination.label.name}</b><small>{[destination.label.district, destination.label.city, destination.label.province, destination.label.postal_code].filter(Boolean).join(', ')}</small></button>)}</div></> : <><p className="shipping-ready">Official destination selected for this saved address. The courier is assigned automatically for this route.</p><div className="shipping-couriers"><button type="button" disabled={busy} onClick={loadRates}>See delivery services</button></div><div className="shipping-rates">{rates.map(rate => <button type="button" className={selected === `${rate.courier_code}:${rate.service}` ? 'selected' : ''} key={`${rate.courier_code}:${rate.service}`} disabled={busy} onClick={() => chooseRate(rate)}><span><b>{rate.courier_name} {rate.service}</b><small>{rate.etd || 'Estimated delivery unavailable'}</small></span><strong>{formatPrice(rate.amount)}</strong></button>)}</div>{quote ? <p className={expired ? 'shipping-error' : 'shipping-ready'}>{expired ? 'Your shipping quote expired. Select a service again.' : <span>Shipping {quote.courier_name} {quote.service} · {quote.etd || 'Estimated delivery unavailable'}<br/>Original shipping {formatPrice(quote.original_shipping_amount ?? quote.amount)} · Shipping voucher −{formatPrice(quote.shipping_discount ?? 0)} · You pay {formatPrice(quote.customer_shipping_total ?? quote.amount)}<br/>Quote expires in {Math.max(0, Math.ceil((Date.parse(quote.expires_at) - (clock ?? 0)) / 60000))} min.</span>}</p> : null}</>}
  </section>
}
