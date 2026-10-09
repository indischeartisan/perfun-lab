import { useCallback, useState } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { adminAssignVendor, getAdminVendorAssignments, getAdminVendorWorkspace, setAdminDefaultVendor } from '../lib/admin'
import { formatPrice } from '../lib/currency'
import { errorMessage } from '../lib/supabase'
import { AdminLoad, AdminPagination } from '../pages/AdminPage'

export function AdminVendorWorkspacePanel() {
  const [page, setPage] = useState(0)
  const load = useCallback(async () => {
    const [workspace, assignments] = await Promise.all([getAdminVendorWorkspace(page), getAdminVendorAssignments(page)])
    return { workspace, assignments }
  }, [page])
  const { data, error, reload } = useAdminData(load, true)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [defaultDraft, setDefaultDraft] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const workspace = data?.workspace
  const defaultVendorId = defaultDraft ?? workspace?.default_vendor_id ?? ''

  async function assign(orderId: string) {
    const vendorId = choices[orderId]
    if (!vendorId) return
    setBusy(orderId); setMessage(''); setActionError('')
    try {
      const result = await adminAssignVendor(orderId, vendorId)
      setChoices(current => { const next = { ...current }; delete next[orderId]; return next })
      setMessage(`Vendor assigned. Fee snapshot: ${formatPrice(result.vendor_fee_amount)}.`)
      reload()
    } catch (error) { setActionError(errorMessage(error)) }
    finally { setBusy(null) }
  }
  async function saveDefault() {
    if (!workspace || defaultVendorId === (workspace.default_vendor_id ?? '')) return
    const vendor = workspace.vendors.find(item => item.id === defaultVendorId)
    const confirmation = defaultVendorId ? `Set ${vendor?.name || vendor?.email || 'this vendor'} as the default vendor for future paid orders?` : 'Clear the default vendor? Future paid orders will remain unassigned.'
    if (!window.confirm(confirmation)) return
    setBusy('default'); setMessage(''); setActionError('')
    try { await setAdminDefaultVendor(defaultVendorId || null); setDefaultDraft(undefined); setMessage(defaultVendorId ? 'Default vendor saved for future paid orders.' : 'Default vendor cleared.'); reload() }
    catch (error) { setActionError(errorMessage(error)) }
    finally { setBusy(null) }
  }

  return <section className="vendor-workspace-panel" aria-label="Vendor workspace controls">
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {workspace ? <>
      <section className="admin-editor"><span className="admin-kicker">AUTO-ASSIGNMENT</span><h2>Default vendor</h2><p className="admin-help">Keep this blank to require manual assignment. Changes apply only to future paid orders.</p><label className="admin-search">Default vendor<select value={defaultVendorId} disabled={busy === 'default'} onChange={event => setDefaultDraft(event.target.value)}><option value="">No default vendor</option>{workspace.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name || vendor.email || vendor.id}</option>)}</select></label><button type="button" disabled={busy === 'default' || defaultVendorId === (workspace.default_vendor_id ?? '')} onClick={() => { void saveDefault() }}>{busy === 'default' ? 'Saving…' : 'Save default vendor'}</button></section>
      {message ? <p className="admin-notice" role="status">{message}</p> : null}{actionError ? <p role="alert">{actionError}</p> : null}
      <section className="admin-section-heading"><div><span className="admin-kicker">MANUAL ASSIGNMENT</span><h2>Paid orders without a vendor</h2><p>{workspace.unassigned_count} awaiting assignment.</p></div></section>
      {!workspace.unassigned_orders.length ? <p className="screen-empty-copy">No paid orders are waiting for a vendor.</p> : null}
      <div className="production-list">{workspace.unassigned_orders.map(order => <article className="customer-order vendor-assignment-card" key={order.id}><header><strong>{order.order_number}</strong><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString()}</time></header><p>{formatPrice(order.grand_total)} · {order.products.map(product => `${product.label} · ${product.bottle_count} × ${product.volume_ml} ml · Qty ${product.quantity}`).join(' / ')}</p><label>Vendor<select value={choices[order.id] ?? ''} disabled={busy === order.id} onChange={event => setChoices(current => ({ ...current, [order.id]: event.target.value }))}><option value="">Choose vendor</option>{workspace.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name || vendor.email || vendor.id}</option>)}</select></label><button type="button" className="orders-build" disabled={!choices[order.id] || busy === order.id} onClick={() => { void assign(order.id) }}>{busy === order.id ? 'Assigning…' : 'Assign vendor'}</button></article>)}</div>
      {workspace.unassigned_count > 25 ? <AdminPagination count={workspace.unassigned_count} page={page} onPage={setPage}/> : null}
      <section className="admin-section-heading"><div><span className="admin-kicker">ASSIGNMENT SNAPSHOT</span><h2>Orders handled by vendors</h2><p>Fee snapshots are immutable after assignment.</p></div></section>
      {!data.assignments.rows.length ? <p className="screen-empty-copy">No vendor assignments yet.</p> : null}
      <div className="production-list">{data.assignments.rows.map(assignment => <article className="customer-order vendor-assignment-card" key={assignment.order_id}><header><strong>{assignment.order_number}</strong><time dateTime={assignment.assigned_at}>{new Date(assignment.assigned_at).toLocaleString()}</time></header><p><strong>Vendor:</strong> {assignment.vendor.name || assignment.vendor.email || assignment.vendor_id}</p><p><strong>Fee:</strong> {formatPrice(assignment.vendor_fee_amount)} · {assignment.assignment_source}</p><ul className="fulfillment-products">{assignment.vendor_fee_snapshot.lines.map(line => <li key={line.position}>{line.product_id} · Qty {line.quantity} · {formatPrice(line.line_fee)}</li>)}</ul></article>)}</div>
      {data.assignments.count > 25 ? <AdminPagination count={data.assignments.count} page={page} onPage={setPage}/> : null}
    </> : null}
  </section>
}
