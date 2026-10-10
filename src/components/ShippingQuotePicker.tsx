import { useEffect, useMemo, useState } from 'react'
import type { Address, OrderIntent } from '../lib/orders'
import { bindShippingDestination, quoteExpired, searchShippingDestinations, selectShippingRate, shippingRates, type ShippingDestination, type ShippingQuote, type ShippingRate } from '../lib/shipping'
import { errorMessage } from '../lib/supabase'
import { formatPrice } from '../lib/currency'

const couriers = [{ id: 'jne', name: 'JNE' }, { id: 'jnt', name: 'J&T' }, { id: 'sicepat', name: 'SiCepat' }]

export function ShippingQuotePicker({ address, items, onQuote }: { address: Address | null; items: OrderIntent[]; onQuote: (quote: ShippingQuote | null) => void }) {
  const [search, setSearch] = useState('')
  const [destinations, setDestinations] = useState<ShippingDestination[]>([])
  const [bound, setBound] = useState(Boolean(address?.rajaongkir_destination_id))
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<ShippingQuote | null>(null)
  const [selected, setSelected] = useState('')
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { setBound(Boolean(address?.rajaongkir_destination_id)); setSearch(''); setDestinations([]); setRates([]); setQuote(null); setSelected(''); setError(''); onQuote(null) }, [address?.id, address?.rajaongkir_destination_id, onQuote])
  useEffect(() => { if (!quote) return; const timer = window.setInterval(() => setClock(Date.now()), 10_000); return () => window.clearInterval(timer) }, [quote])
  useEffect(() => {
    if (search.trim().length < 3 || bound) { setDestinations([]); return }
    const timer = window.setTimeout(() => {
      setBusy(true); setError('')
      searchShippingDestinations(search.trim()).then(setDestinations).catch(error => setError(errorMessage(error))).finally(() => setBusy(false))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [search, bound])
  const expired = quote ? quoteExpired(quote, clock) : false
  const grouped = useMemo(() => couriers.map(courier => ({ ...courier, rates: rates.filter(rate => rate.courier_code === courier.id) })), [rates])
  async function chooseDestination(destination: ShippingDestination) {
    if (!address || busy) return
    setBusy(true); setError('')
    try { await bindShippingDestination(address.id, search.trim(), destination.id); setBound(true); setDestinations([]) }
    catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  async function loadRates(courier: string) {
    if (!address || !bound || busy) return
    setBusy(true); setError(''); setQuote(null); onQuote(null)
    try { const next = await shippingRates(address.id, items, courier); setRates(current => [...current.filter(rate => rate.courier_code !== courier), ...next]) }
    catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  async function chooseRate(rate: ShippingRate) {
    if (!address || busy) return
    setBusy(true); setError(''); setSelected(`${rate.courier_code}:${rate.service}`)
    try { const next = await selectShippingRate(address.id, items, rate.courier_code, rate.service); setQuote(next); onQuote(next) }
    catch (error) { setSelected(''); setQuote(null); onQuote(null); setError(errorMessage(error)) } finally { setBusy(false) }
  }
  if (!address) return <section className="shipping-picker"><h2>Shipping</h2><p>Select a delivery address first.</p></section>
  return <section className="shipping-picker" aria-busy={busy}><h2>Shipping</h2>
    {error ? <p role="alert" className="shipping-error">{error}</p> : null}
    {!bound ? <><p>Search and select the official RajaOngkir destination for this address.</p><label className="shipping-search"><span>District, city, or postal code</span><input value={search} onChange={event => setSearch(event.target.value)} minLength={3} placeholder="e.g. Tigaraksa 15720" disabled={busy}/></label>{search.length >= 3 && !busy && !destinations.length && !error ? <p>No destination found. Refine your search.</p> : null}<div className="shipping-destinations">{destinations.map(destination => <button type="button" key={destination.id} disabled={busy} onClick={() => chooseDestination(destination)}><b>{destination.label.name}</b><small>{[destination.label.district, destination.label.city, destination.label.province, destination.label.postal_code].filter(Boolean).join(', ')}</small></button>)}</div></> : <><p className="shipping-ready">Official destination selected for this saved address.</p><div className="shipping-couriers">{couriers.map(courier => <button type="button" key={courier.id} disabled={busy} onClick={() => loadRates(courier.id)}>See {courier.name} services</button>)}</div><div className="shipping-rates">{grouped.flatMap(group => group.rates.map(rate => <button type="button" className={selected === `${rate.courier_code}:${rate.service}` ? 'selected' : ''} key={`${rate.courier_code}:${rate.service}`} disabled={busy} onClick={() => chooseRate(rate)}><span><b>{rate.courier_name} {rate.service}</b><small>{rate.etd || 'Estimated delivery unavailable'}</small></span><strong>{formatPrice(rate.amount)}</strong></button>))}</div>{quote ? <p className={expired ? 'shipping-error' : 'shipping-ready'}>{expired ? 'Your shipping quote expired. Select a service again.' : `Shipping selected. Quote expires in ${Math.max(0, Math.ceil((Date.parse(quote.expires_at) - clock) / 60000))} min.`}</p> : null}</>}
  </section>
}
