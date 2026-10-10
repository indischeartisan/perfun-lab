import { useCallback, useState } from 'react'
import { AdminPagination, AdminLoad } from './AdminPage'
import { useAdminData } from '../hooks/useAdminData'
import { getVendorPayoutDashboard, type VendorPayout } from '../lib/payouts'
import { formatPrice } from '../lib/currency'

export function VendorPaymentsPage() {
  const [page, setPage] = useState(0)
  const load = useCallback(() => getVendorPayoutDashboard(page), [page])
  const { data, error, reload } = useAdminData(load, true)
  return <section className="app-screen admin-dashboard">
    <header className="screen-title"><span>VENDOR WORKSPACE</span><h1>Payments</h1><p>Payout records are prepared by Admin. “Paid” records a manual transfer reference; it is not bank confirmation.</p></header>
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <><div className="admin-metrics"><article><span>Earned today · WIB</span><strong>{formatPrice(data.earned_today)}</strong></article><article><span>Unpaid total</span><strong>{formatPrice(data.unpaid_total)}</strong></article><article><span>Paid total</span><strong>{formatPrice(data.paid_total)}</strong></article></div>
      {!data.payouts.length ? <div className="screen-empty"><h2>No payout history yet</h2><p>Completed shipments appear here after Admin creates a daily payout draft.</p></div> : <div className="production-list">{data.payouts.map(payout => <PayoutCard key={payout.id} payout={payout}/>)}</div>}
      {data.count > 25 ? <AdminPagination count={data.count} page={page} onPage={setPage}/> : null}
    </> : null}
  </section>
}

export function PayoutCard({ payout, admin }: { payout: VendorPayout; admin?: boolean }) {
  return <article className="customer-order payout-card"><header><strong>{payout.payout_date}</strong><time dateTime={payout.created_at}>{new Date(payout.created_at).toLocaleString()}</time><b className="order-status">{payout.status}</b></header>
    {admin ? <p><strong>Vendor:</strong> {payout.vendor.name || payout.vendor.email || payout.vendor_id}</p> : null}
    <p><strong>Total: {formatPrice(payout.total)}</strong></p>
    {payout.transfer_reference ? <p>Transfer reference: {payout.transfer_reference}</p> : null}
    {payout.void_reason ? <p>Void reason: {payout.void_reason}</p> : null}
    <ul className="fulfillment-products">{payout.items.map(item => <li key={item.id}><strong>{item.order_number}</strong><span>Service {formatPrice(item.vendor_fee_amount)} · Shipping reimbursement {formatPrice(item.shipping_reimbursement)} · Total {formatPrice(item.total_amount)}</span></li>)}</ul>
    {admin ? <p className="admin-help">{payout.status === 'draft' ? 'Reserved: this order cannot enter another active payout.' : payout.status === 'paid' ? 'Manual transfer was recorded by Admin.' : 'Draft was voided; items may become eligible again.'}</p> : null}
  </article>
}
