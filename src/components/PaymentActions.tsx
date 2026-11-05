import { useRef, useState } from 'react'
import type { CustomerOrder } from '../lib/orders'
import { paymentRequest } from '../lib/payments'
import { errorMessage } from '../lib/supabase'

export function PaymentActions({ order, onRefresh }: { order: CustomerOrder; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const payable = order.status === 'pending_payment' && !['paid', 'refunded'].includes(order.payment_status)
  async function action(pay: boolean) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const data = await paymentRequest(pay ? 'payments-create' : 'payments-sync', order.id)
      if (pay) {
        if (!data.payment_url || new URL(data.payment_url).protocol !== 'https:') throw new Error('Tautan pembayaran belum tersedia. Muat ulang pesanan Anda.')
        window.location.assign(data.payment_url)
      } else onRefresh()
    } catch (cause) { setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="payment-actions"><p className={`payment-label payment-${order.payment_status}`}>Pembayaran: <strong>{order.payment_status}</strong></p>
    {error ? <p role="alert">{error}</p> : null}
    <div>{payable ? <button className="orders-build" disabled={busy} onClick={() => action(true)}>{busy ? 'Menyiapkan pembayaran…' : order.payments?.length ? 'Bayar lagi di DOKU' : 'Bayar di DOKU'}</button> : null}
      {order.payments?.length ? <button disabled={busy} onClick={() => action(false)}>Cek status pembayaran</button> : null}
    </div>
  </div>
}
