import { useCallback, useState } from 'react'
import { AdminLoad } from './AdminPage'
import { useVendorData } from '../hooks/useVendorData'
import { getVendorPayoutRecap, type PayoutRecapPeriod, type VendorPayout } from '../lib/payouts'
import { formatPrice } from '../lib/currency'
import { WorkspaceCardHeader } from '../components/WorkspacePresentation'
import { PayoutRecap } from '../components/AdminVendorPaymentsPanel'

export function VendorPaymentsPage({ accountId }: { accountId: string }) {
  const [period, setPeriod] = useState<PayoutRecapPeriod>('day')
  const load = useCallback(() => getVendorPayoutRecap(period), [period])
  const { data, error, reload } = useVendorData(accountId, `payments:${period}`, load)
  return <section className="app-screen vendor-payments-page">
    <header className="screen-title"><span>RUANG KERJA PERFUMER</span><h1>Pembayaran</h1><p>Rekap baca-saja untuk pesanan Anda. Riwayat pembayaran dicatat terpisah oleh Admin.</p></header>
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    <div className="vendor-payout-controls"><label>Rekap periode<select aria-label="Rekap periode" value={period} onChange={event => setPeriod(event.target.value as PayoutRecapPeriod)}><option value="day">Hari ini (WIB)</option><option value="week">Mingguan (WIB)</option><option value="month">Bulanan (WIB)</option></select></label></div>
    {data ? <><PayoutRecap data={data} vendorView/>{data.payouts.length ? <details className="finance-section"><summary>Riwayat pembayaran</summary><div className="production-list">{data.payouts.map(payout => <PayoutCard key={payout.id} payout={payout}/>)}</div></details> : null}</> : null}
  </section>
}

export function PayoutCard({ payout, admin }: { payout: VendorPayout; admin?: boolean }) {
  const paidAt = payout.paid_at ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(payout.paid_at)) : null
  return <article className="customer-order payout-card"><WorkspaceCardHeader orderNumber={payout.payout_date} time={new Date(payout.created_at).toLocaleString('id-ID')} status={payout.status}/>
    {admin ? <p><strong>Perfumer:</strong> {payout.vendor.name || payout.vendor.email || payout.vendor_id}</p> : null}
    <p><strong>Total dibayar ke perfumer: {formatPrice(payout.total)}</strong></p>
    {paidAt ? <p>Tanggal pembayaran dicatat: {paidAt}</p> : null}
    {payout.transfer_reference ? <p>Referensi transfer: {payout.transfer_reference}</p> : null}
    {payout.void_reason ? <p>Alasan pembatalan: {payout.void_reason}</p> : null}
    <ul className="fulfillment-products">{payout.items.map(item => <li key={item.id}><strong>{item.public_order_number}</strong><span>Jasa pembuatan: {formatPrice(item.vendor_fee_amount)}</span><span>Penggantian ongkir: {formatPrice(item.shipping_reimbursement)}</span><span>Total dibayar ke perfumer: {formatPrice(item.total_amount)}</span></li>)}</ul>
    {admin ? <p className="admin-help">{payout.status === 'draft' ? 'Dipesan: pesanan ini tidak dapat masuk ke draf aktif lain.' : payout.status === 'paid' ? 'Transfer manual dicatat oleh Admin.' : 'Draf dibatalkan; pesanan dapat memenuhi syarat lagi.'}</p> : null}
  </article>
}
