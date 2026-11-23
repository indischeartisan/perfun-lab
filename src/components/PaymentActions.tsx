import { useEffect, useRef, useState } from 'react'
import type { CustomerOrder } from '../lib/orders'
import { paymentRequest } from '../lib/payments'
import { paymentErrorMessage } from '../lib/paymentErrorMessage'
import { formatPaymentCountdown, paymentDeadlineState } from '../lib/paymentCountdown'

export function PaymentActions({ order, onRefresh }: { order: CustomerOrder; onRefresh: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const lock = useRef(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [order.payment_deadline_at])
  const countdown = paymentDeadlineState(order.payment_deadline_at, now)
  const payable = order.status === 'pending_payment' && !['paid', 'refunded', 'expired'].includes(order.payment_status) && !countdown.expired
  async function action(pay: boolean) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const data = await paymentRequest(pay ? 'payments-create' : 'payments-sync', order.id)
      if (pay) {
        if (!data.payment_url || new URL(data.payment_url).protocol !== 'https:') throw new Error('Tautan pembayaran belum tersedia. Muat ulang pesanan Anda.')
        window.sessionStorage.setItem(`perfun:payment-return-order:${order.user_id}`, order.id)
        window.location.assign(data.payment_url)
      } else await onRefresh()
    } catch (cause) { setError(paymentErrorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="payment-actions" aria-labelledby="payment-title"><div className="payment-actions-heading"><span>PEMBAYARAN DOKU</span><h2 id="payment-title">Bayar dengan aman</h2><p>Anda akan diarahkan ke DOKU untuk menyelesaikan pembayaran.</p></div><p className={`payment-label payment-${order.payment_status}`}>Status pembayaran: <strong>{order.payment_status === 'expired' ? 'kedaluwarsa' : order.payment_status.replaceAll('_', ' ')}</strong></p>
    <p className={`payment-countdown${countdown.expired ? ' expired' : ''}`} role="timer" aria-live="polite">{countdown.expired ? 'Batas pembayaran telah berakhir. Periksa status pembayaran untuk konfirmasi akhir.' : <>Sisa waktu pembayaran: <strong>{formatPaymentCountdown(countdown.remainingSeconds)}</strong></>}</p>
    {error ? <div className="payment-error" role="alert"><strong>Pembayaran belum dapat dimulai.</strong><p>{error}</p><small>Simpan nomor pesanan ini jika Anda perlu bantuan dari Perfun Lab.</small></div> : null}
    <div>{payable ? <button className="orders-build" disabled={busy} onClick={() => action(true)}>{busy ? 'Menyiapkan pembayaran…' : order.payments?.length ? 'Bayar lagi di DOKU' : 'Bayar di DOKU'}</button> : null}
      {order.payments?.length ? <button disabled={busy} onClick={() => action(false)}>Cek status pembayaran</button> : null}
    </div>
  </section>
}
