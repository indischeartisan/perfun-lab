import { useCallback, useState } from 'react'
import { AdminPagination, AdminLoad } from './AdminPage'
import { useAdminData } from '../hooks/useAdminData'
import { getVendorPayoutDashboard, type VendorPayout } from '../lib/payouts'
import { formatPrice } from '../lib/currency'
import { WorkspaceCardHeader } from '../components/WorkspacePresentation'

export function VendorPaymentsPage() {
  const [page, setPage] = useState(0)
  const load = useCallback(() => getVendorPayoutDashboard(page), [page])
  const { data, error, reload } = useAdminData(load, true)
  return <section className="app-screen admin-dashboard">
    <header className="screen-title"><span>RUANG KERJA PERFUMER</span><h1>Pembayaran</h1><p>Draf pembayaran disiapkan Admin. “Selesai” mencatat referensi transfer manual, bukan konfirmasi bank.</p></header>
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <><div className="admin-metrics"><article><span>Earned today · WIB</span><strong>{formatPrice(data.earned_today)}</strong></article><article><span>Unpaid total</span><strong>{formatPrice(data.unpaid_total)}</strong></article><article><span>Paid total</span><strong>{formatPrice(data.paid_total)}</strong></article></div>
      {!data.payouts.length ? <div className="screen-empty"><h2>Belum ada riwayat pembayaran</h2><p>Pengiriman selesai akan muncul setelah Admin membuat draf pembayaran.</p></div> : <div className="production-list">{data.payouts.map(payout => <PayoutCard key={payout.id} payout={payout}/>)}</div>}
      {data.count > 25 ? <AdminPagination count={data.count} page={page} onPage={setPage}/> : null}
    </> : null}
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
    <ul className="fulfillment-products">{payout.items.map(item => <li key={item.id}><strong>{item.order_number}</strong><span>Jasa pembuatan: {formatPrice(item.vendor_fee_amount)}</span><span>Penggantian ongkir: {formatPrice(item.shipping_reimbursement)}</span><span>Total dibayar ke perfumer: {formatPrice(item.total_amount)}</span></li>)}</ul>
    {admin ? <p className="admin-help">{payout.status === 'draft' ? 'Dipesan: pesanan ini tidak dapat masuk ke draf aktif lain.' : payout.status === 'paid' ? 'Transfer manual dicatat oleh Admin.' : 'Draf dibatalkan; pesanan dapat memenuhi syarat lagi.'}</p> : null}
  </article>
}
