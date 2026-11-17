import { useCallback, useState } from 'react'
import { AdminLoad, AdminPagination } from '../pages/AdminPage'
import { PayoutCard } from '../pages/VendorPaymentsPage'
import { useAdminData } from '../hooks/useAdminData'
import { createVendorPayout, getAdminPayoutWorkspace, markVendorPayoutPaid, voidVendorPayout, type EligiblePayoutOrder } from '../lib/payouts'
import { formatPrice } from '../lib/currency'
import { errorMessage } from '../lib/supabase'

export function AdminVendorPaymentsPanel({ onPayoutChanged }: { onPayoutChanged: () => void }) {
  const [page, setPage] = useState(0)
  const load = useCallback(() => getAdminPayoutWorkspace(page), [page])
  const { data, error, reload } = useAdminData(load)
  const [busy, setBusy] = useState<string | null>(null)
  const [references, setReferences] = useState<Record<string, string>>({})
  const [draftRequests, setDraftRequests] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const eligibleByVendor = data?.eligible_orders.reduce<Record<string, EligiblePayoutOrder[]>>((groups, order) => { (groups[order.vendor_id] ??= []).push(order); return groups }, {}) ?? {}
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key); setMessage(''); setActionError('')
    try { await action(); setMessage(success); reload(); onPayoutChanged() } catch (error) { setActionError(errorMessage(error)) } finally { setBusy(null) }
  }
  async function createDraft(vendorId: string) {
    const requestId = draftRequests[vendorId] ?? crypto.randomUUID()
    if (!draftRequests[vendorId]) setDraftRequests(current => ({ ...current, [vendorId]: requestId }))
    setBusy(vendorId); setMessage(''); setActionError('')
    try { await createVendorPayout(vendorId, requestId); setDraftRequests(current => { const next = { ...current }; delete next[vendorId]; return next }); setMessage('Draf pembayaran dibuat.'); reload(); onPayoutChanged() }
    catch (error) { setActionError(errorMessage(error)) } finally { setBusy(null) }
  }
  return <section className="vendor-workspace-panel" aria-label="Pembayaran perfumer">
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <><div className="admin-metrics"><article><span>Pesanan siap dibayar</span><strong>{data.eligible_count}</strong></article><article><span>Jasa pembuatan</span><strong>{formatPrice(data.outstanding_service)}</strong></article><article><span>Ongkir yang dibayarkan ke perfumer</span><strong>{formatPrice(data.outstanding_shipping)}</strong></article><article><span>Total perlu ditransfer</span><strong>{formatPrice(data.outstanding_total)}</strong></article></div>
      {message ? <p className="admin-notice" role="status">{message}</p> : null}{actionError ? <p role="alert">{actionError}</p> : null}
      <section className="admin-section-heading"><div><span className="admin-kicker">PESANAN SIAP DIBAYAR</span><h2>Buat draf pembayaran</h2><p>Daftar dan total ini memakai aturan yang sama dengan ringkasan Keuangan.</p></div></section>
      {data.review_orders.length ? <section className="admin-editor"><h2>Perlu ditinjau ({data.review_count})</h2><p>Pesanan ini tidak masuk draf sampai pembayar ongkir dan tarif RajaOngkir sebelum voucher dapat dipastikan.</p><ul className="fulfillment-products">{data.review_orders.map(order => <li key={order.order_id}><strong>{order.order_number}</strong><span>{order.review_reason}</span></li>)}</ul></section> : null}
      {!data.eligible_orders.length ? <p className="screen-empty-copy">Belum ada pesanan yang siap dibayar.</p> : Object.entries(eligibleByVendor).map(([vendorId, orders]) => <article className="admin-editor payout-group" key={vendorId}><h2>{orders[0].vendor.name || orders[0].vendor.email || vendorId}</h2><p>{orders.length} pesanan · {formatPrice(orders.reduce((sum, order) => sum + order.total_amount, 0))}</p><ul className="fulfillment-products">{orders.map(order => <li key={order.order_id}><strong>{order.order_number}</strong><span>Jasa pembuatan: {formatPrice(order.vendor_fee_amount)}</span><span>Penggantian ongkir: {formatPrice(order.shipping_reimbursement)}{order.shipping_payer === 'perfun' ? ' · dibayar Perfun Lab' : ''}</span><span>Total dibayar ke perfumer: {formatPrice(order.total_amount)}</span></li>)}</ul><button className="orders-build" disabled={busy === vendorId} onClick={() => { void createDraft(vendorId) }}>{busy === vendorId ? 'Menyimpan…' : 'Buat draf pembayaran'}</button></article>)}
      <section className="admin-section-heading"><div><span className="admin-kicker">RIWAYAT PEMBAYARAN</span><h2>Draf dan pembayaran selesai</h2><p>Tanggal pembayaran dicatat setelah Admin memasukkan referensi transfer.</p></div></section>
      <div className="production-list">{data.payouts.map(payout => <section key={payout.id} className="payout-admin-card"><PayoutCard payout={payout} admin/>{payout.status === 'draft' ? <div className="payout-actions"><label>Referensi transfer<input value={references[payout.id] ?? ''} maxLength={200} disabled={busy === payout.id} onChange={event => setReferences(current => ({ ...current, [payout.id]: event.target.value }))}/></label><button className="orders-build" disabled={busy === payout.id || !(references[payout.id] ?? '').trim()} onClick={() => { void run(payout.id, () => markVendorPayoutPaid(payout.id, references[payout.id] ?? ''), 'Pembayaran ditandai selesai. Pastikan transfer bank telah dilakukan.') }}>{busy === payout.id ? 'Menyimpan…' : 'Tandai sudah dibayar'}</button><button disabled={busy === payout.id} onClick={() => { const reason = window.prompt('Alasan membatalkan seluruh draf pembayaran:'); if (reason) void run(payout.id, () => voidVendorPayout(payout.id, reason), 'Draf pembayaran dibatalkan dan reservasi pesanan dilepas.') }}>Batalkan draf</button></div> : null}</section>)}</div>
      {data.payout_count > 25 ? <AdminPagination count={data.payout_count} page={page} onPage={setPage}/> : null}
    </> : null}
  </section>
}
