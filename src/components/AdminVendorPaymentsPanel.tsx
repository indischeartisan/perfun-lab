import { useCallback, useState } from 'react'
import { AdminLoad, AdminPagination } from '../pages/AdminPage'
import { PayoutCard } from '../pages/VendorPaymentsPage'
import { useAdminData } from '../hooks/useAdminData'
import { createVendorPayout, getAdminPayoutWorkspace, markVendorPayoutPaid, voidVendorPayout, type EligiblePayoutOrder } from '../lib/payouts'
import { formatPrice } from '../lib/currency'
import { errorMessage } from '../lib/supabase'

export function AdminVendorPaymentsPanel() {
  const [page, setPage] = useState(0)
  const load = useCallback(() => getAdminPayoutWorkspace(page), [page])
  const { data, error, reload } = useAdminData(load, true)
  const [busy, setBusy] = useState<string | null>(null)
  const [references, setReferences] = useState<Record<string, string>>({})
  const [draftRequests, setDraftRequests] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const eligibleByVendor = data?.eligible_orders.reduce<Record<string, EligiblePayoutOrder[]>>((groups, order) => { (groups[order.vendor_id] ??= []).push(order); return groups }, {}) ?? {}
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key); setMessage(''); setActionError('')
    try { await action(); setMessage(success); reload() } catch (error) { setActionError(errorMessage(error)) } finally { setBusy(null) }
  }
  async function createDraft(vendorId: string) {
    const requestId = draftRequests[vendorId] ?? crypto.randomUUID()
    if (!draftRequests[vendorId]) setDraftRequests(current => ({ ...current, [vendorId]: requestId }))
    setBusy(vendorId); setMessage(''); setActionError('')
    try { await createVendorPayout(vendorId, requestId); setDraftRequests(current => { const next = { ...current }; delete next[vendorId]; return next }); setMessage('Daily payout draft created.'); reload() }
    catch (error) { setActionError(errorMessage(error)) } finally { setBusy(null) }
  }
  return <section className="vendor-workspace-panel" aria-label="Vendor payments">
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <><div className="admin-metrics"><article><span>Unpaid vendor billing</span><strong>{formatPrice(data.outstanding_total)}</strong></article><article><span>Eligible orders</span><strong>{data.eligible_count}</strong></article><article><span>Payout date · WIB</span><strong>{data.today}</strong></article></div>
      {message ? <p className="admin-notice" role="status">{message}</p> : null}{actionError ? <p role="alert">{actionError}</p> : null}
      <section className="admin-section-heading"><div><span className="admin-kicker">ELIGIBLE ORDERS</span><h2>Create daily draft</h2><p>Only shipped or delivered orders with complete packing and finalized actual shipping are included.</p></div></section>
      {!data.eligible_orders.length ? <p className="screen-empty-copy">No eligible vendor orders.</p> : Object.entries(eligibleByVendor).map(([vendorId, orders]) => <article className="admin-editor payout-group" key={vendorId}><h2>{orders[0].vendor.name || orders[0].vendor.email || vendorId}</h2><p>{orders.length} eligible orders · {formatPrice(orders.reduce((sum, order) => sum + order.total_amount, 0))}</p><ul className="fulfillment-products">{orders.map(order => <li key={order.order_id}><strong>{order.order_number}</strong><span>Service {formatPrice(order.vendor_fee_amount)} · Reimbursement {formatPrice(order.shipping_reimbursement)} ({order.shipping_payer})</span></li>)}</ul><button className="orders-build" disabled={busy === vendorId} onClick={() => { void createDraft(vendorId) }}>{busy === vendorId ? 'Creating…' : 'Create daily draft'}</button></article>)}
      <section className="admin-section-heading"><div><span className="admin-kicker">PAYOUT HISTORY</span><h2>Drafts and paid records</h2><p>Marking paid records a manual transfer reference only.</p></div></section>
      <div className="production-list">{data.payouts.map(payout => <section key={payout.id} className="payout-admin-card"><PayoutCard payout={payout} admin/>{payout.status === 'draft' ? <div className="payout-actions"><label>Transfer reference<input value={references[payout.id] ?? ''} maxLength={200} disabled={busy === payout.id} onChange={event => setReferences(current => ({ ...current, [payout.id]: event.target.value }))}/></label><button className="orders-build" disabled={busy === payout.id || !(references[payout.id] ?? '').trim()} onClick={() => { void run(payout.id, () => markVendorPayoutPaid(payout.id, references[payout.id] ?? ''), 'Payout marked paid. Verify the bank transfer separately.') }}>{busy === payout.id ? 'Saving…' : 'Mark paid'}</button><button disabled={busy === payout.id} onClick={() => { const reason = window.prompt('Reason for voiding this entire payout draft:'); if (reason) void run(payout.id, () => voidVendorPayout(payout.id, reason), 'Payout draft voided and its reservations released.') }}>Void draft</button></div> : null}</section>)}</div>
      {data.payout_count > 25 ? <AdminPagination count={data.payout_count} page={page} onPage={setPage}/> : null}
    </> : null}
  </section>
}
