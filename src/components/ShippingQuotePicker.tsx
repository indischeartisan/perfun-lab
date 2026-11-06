import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, OrderIntent } from '../lib/orders'
import { autoSelectShippingRate, quoteExpired, type ShippingQuote } from '../lib/shipping'
import { shippingErrorMessage } from '../lib/shippingMessages'
import { formatPrice } from '../lib/currency'
import { hasVerifiedShippingDestination, shippingDestinationState } from '../lib/shippingAddressState'

/** Fetches the server-routed rates, then asks the server to quote the lowest valid service. */
export function ShippingQuotePicker({ address, items, onQuote }: { address: Address | null; items: OrderIntent[]; onQuote: (quote: ShippingQuote | null) => void }) {
  const bound = hasVerifiedShippingDestination(address)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<ShippingQuote | null>(null)
  const [clock, setClock] = useState<number | null>(null)
  const lifecycle = useRef(0)
  const activeRequest = useRef(false)
  const loadQuote = useCallback(async () => {
    if (!address || !bound || activeRequest.current) return
    const revision = lifecycle.current
    activeRequest.current = true
    setBusy(true); setError(''); setQuote(null); onQuote(null)
    try {
      const next = await autoSelectShippingRate(address.id, items)
      if (lifecycle.current === revision) { setClock(Date.parse(next.expires_at) - 600_000); setQuote(next); onQuote(next) }
    } catch (cause) {
      if (lifecycle.current === revision) { setQuote(null); onQuote(null); setError(shippingErrorMessage(cause)) }
    } finally {
      if (lifecycle.current === revision) setBusy(false)
      activeRequest.current = false
    }
  }, [address, bound, items, onQuote])
  useEffect(() => {
    const revision = ++lifecycle.current
    activeRequest.current = false
    const timer = window.setTimeout(() => { void loadQuote() }, 0)
    return () => { window.clearTimeout(timer); if (lifecycle.current === revision) lifecycle.current += 1 }
  }, [loadQuote])
  useEffect(() => { if (!quote) return; const timer = window.setInterval(() => setClock(Date.now()), 10_000); return () => window.clearInterval(timer) }, [quote])
  const expired = quote ? quoteExpired(quote, clock ?? 0) : false

  if (!address) return <section className="shipping-picker"><h2>Pengiriman</h2><p>Pilih alamat pengiriman terlebih dahulu.</p></section>
  if (!bound) return <section className="shipping-picker"><h2>Pengiriman</h2><p>{shippingDestinationState(address) === 'inconsistent' ? 'Periksa lokasi pengiriman pada alamat ini sebelum menghitung ongkir.' : 'Lengkapi lokasi pengiriman pada alamat ini sebelum menghitung ongkir.'}</p></section>
  return <section className="shipping-picker" aria-busy={busy}><h2>Pengiriman</h2>
    {busy ? <p role="status">Menghitung ongkir terbaikâ€¦</p> : null}
    {error ? <p role="alert" className="shipping-error">{error} <button type="button" onClick={() => void loadQuote()}>Coba lagi</button></p> : null}
    {quote ? <div className={expired ? 'shipping-error' : 'shipping-ready'}>{expired ? <><p>Quote ongkir kedaluwarsa. Hitung ulang untuk melanjutkan.</p><button type="button" onClick={() => void loadQuote()}>Coba lagi</button></> : <p><strong>{quote.courier_name} {quote.service}</strong><br/>{quote.etd || 'Estimasi pengiriman belum tersedia'}<br/>Ongkir {formatPrice(quote.original_shipping_amount ?? quote.amount)} Â· Voucher ongkir âˆ’{formatPrice(quote.shipping_discount ?? 0)} Â· Dibayar {formatPrice(quote.customer_shipping_total ?? quote.amount)}</p>}</div> : null}
  </section>
}
