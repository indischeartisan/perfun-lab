import { useEffect, useRef, useState } from 'react'
import type { Address, OrderIntent } from '../lib/orders'
import { quoteExpired, selectShippingRate, shippingRates, type ShippingQuote, type ShippingRate } from '../lib/shipping'
import { errorMessage } from '../lib/supabase'
import { formatPrice } from '../lib/currency'
import { hasVerifiedShippingDestination, shippingDestinationState } from '../lib/shippingAddressState'

export function ShippingQuotePicker({ address, items, onQuote }: { address: Address | null; items: OrderIntent[]; onQuote: (quote: ShippingQuote | null) => void }) {
  const bound = hasVerifiedShippingDestination(address)
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<ShippingQuote | null>(null)
  const [selected, setSelected] = useState('')
  const [clock, setClock] = useState<number | null>(null)
  const lifecycle = useRef(0)
  const busy = actionBusy
  useEffect(() => {
    const revision = ++lifecycle.current
    return () => { if (lifecycle.current === revision) lifecycle.current += 1 }
  }, [])
  useEffect(() => { if (!quote) return; const timer = window.setInterval(() => setClock(Date.now()), 10_000); return () => window.clearInterval(timer) }, [quote])
  const expired = quote ? quoteExpired(quote, clock ?? 0) : false
  async function loadRates() {
    if (!address || !bound || busy) return
    const revision = lifecycle.current
    setActionBusy(true); setError(''); setQuote(null); onQuote(null)
    try { const next = await shippingRates(address.id, items); if (lifecycle.current === revision) setRates(next) }
    catch (error) { if (lifecycle.current === revision) setError(errorMessage(error)) } finally { if (lifecycle.current === revision) setActionBusy(false) }
  }
  async function chooseRate(rate: ShippingRate) {
    if (!address || busy) return
    const revision = lifecycle.current
    setActionBusy(true); setError(''); setSelected(`${rate.courier_code}:${rate.service}`); setQuote(null); onQuote(null)
    try { const next = await selectShippingRate(address.id, items, rate.service); if (lifecycle.current === revision) { setClock(Date.parse(next.expires_at) - 600_000); setQuote(next); onQuote(next) } }
    catch (error) { if (lifecycle.current === revision) { setSelected(''); setQuote(null); onQuote(null); setError(errorMessage(error)) } } finally { if (lifecycle.current === revision) setActionBusy(false) }
  }
  if (!address) return <section className="shipping-picker"><h2>Shipping</h2><p>Select a delivery address first.</p></section>
  return <section className="shipping-picker" aria-busy={busy}><h2>Shipping</h2>
    {error ? <p role="alert" className="shipping-error">{error}</p> : null}
    {!bound ? <p>{shippingDestinationState(address) === 'inconsistent' ? 'Periksa lokasi pengiriman pada alamat di atas untuk melihat layanan.' : 'Lengkapi Lokasi Pengiriman pada alamat di atas untuk melihat layanan.'}</p> : <><p className="shipping-ready">Kurir ditentukan otomatis berdasarkan lokasi pengiriman.</p><div className="shipping-couriers"><button type="button" disabled={busy} onClick={loadRates}>Lihat layanan pengiriman</button></div><div className="shipping-rates">{rates.map(rate => <button type="button" className={selected === `${rate.courier_code}:${rate.service}` ? 'selected' : ''} key={`${rate.courier_code}:${rate.service}`} disabled={busy} onClick={() => chooseRate(rate)}><span><b>{rate.courier_name} {rate.service}</b><small>{rate.etd || 'Estimasi pengiriman belum tersedia'}</small></span><strong>{formatPrice(rate.amount)}</strong></button>)}</div>{quote ? <p className={expired ? 'shipping-error' : 'shipping-ready'}>{expired ? 'Ongkir kedaluwarsa. Pilih layanan kembali.' : <span>Pengiriman {quote.courier_name} {quote.service} · {quote.etd || 'Estimasi belum tersedia'}<br/>Ongkir {formatPrice(quote.original_shipping_amount ?? quote.amount)} · Voucher ongkir −{formatPrice(quote.shipping_discount ?? 0)} · Dibayar {formatPrice(quote.customer_shipping_total ?? quote.amount)}<br/>Berlaku {Math.max(0, Math.ceil((Date.parse(quote.expires_at) - (clock ?? 0)) / 60000))} menit.</span>}</p> : null}</>}
  </section>
}
