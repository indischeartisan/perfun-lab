import { useCallback, useState } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { getAdminCustomers, getAdminOrders, getAdminOverview, getAdminVendorWorkspace, type AdminOrderFilters, type AdminOverview } from '../lib/admin'
import { formatPrice } from '../lib/currency'
import { AdminCatalogPanel } from '../components/AdminCatalogPanel'
import { ProductionPage } from './ProductionPage'
import { FulfillmentPage } from './FulfillmentPage'
import { AdminVendorWorkspacePanel } from '../components/AdminVendorWorkspacePanel'
import { AdminVendorPaymentsPanel } from '../components/AdminVendorPaymentsPanel'
import { AdminMoreMenu, AdminWorkspaceNavigation, type AdminWorkspaceTab } from '../components/WorkspaceNavigation'
import { OperationsBottleSize, OperationsOrderCard, OperationsOrderHeader, OperationsStatusTabs } from '../components/OperationsPresentation'
import { TestRunsPanel } from '../components/TestRunsPanel'
import { getNoteStickerAsset } from '../lib/noteAssets'

const label = (value: string) => value.replaceAll('_', ' ')
export function AdminPage({ userId }: { userId: string }) {
  const [tab, setTab] = useState<AdminWorkspaceTab>('Overview')
  const [operation, setOperation] = useState<'production' | 'fulfillment' | 'assignment'>('production')
  return <section className="app-screen admin-dashboard">
    <header className="screen-title workspace-title"><span>PERFUN LAB OPERATIONS</span><h1>Dashboard</h1><p>Pantau pesanan, produksi, dan pengiriman.</p></header>
    <AdminWorkspaceNavigation active={tab} onNavigate={setTab}/>
    <div className="admin-content" key={tab}>
      {tab === 'Overview' || tab === 'Revenue' ? <Overview revenueOnly={tab === 'Revenue'} onOrders={() => setTab('Orders')}/> : null}
      {tab === 'Orders' ? <><TestRunsPanel role="admin"/><AdminOrders/></> : null}
      {tab === 'More' ? <AdminMoreMenu onNavigate={setTab}/> : null}
      {tab === 'Vendor Payments' ? <AdminVendorPaymentsPanel/> : null}
      {tab === 'Customers' ? <AdminCustomers/> : null}
      {tab === 'Notes' || tab === 'Products & Pricing' ? <AdminCatalogPanel section={tab === 'Notes' ? 'notes' : 'products'}/> : null}
      {tab === 'Operations' ? <AdminOperations userId={userId} operation={operation} onOperation={setOperation}/> : null}
    </div>
  </section>
}

function AdminOperations({ userId, operation, onOperation }: { userId: string; operation: 'production' | 'fulfillment' | 'assignment'; onOperation: (value: 'production' | 'fulfillment' | 'assignment') => void }) {
  const { data: overview, error: overviewError } = useAdminData(getAdminOverview, true)
  const loadAssignments = useCallback(() => getAdminVendorWorkspace(0), [])
  const { data: assignments, error: assignmentError } = useAdminData(loadAssignments, true)
  return <>{overviewError || assignmentError ? <p role="alert">Some operation counts could not be loaded. Open a tab to refresh its data.</p> : null}<OperationsStatusTabs label="Operations" items={[
    { id: 'production', label: 'Production (active)', count: overview ? overview.production_queued + overview.production_in_progress : '–', active: operation === 'production', onClick: () => onOperation('production') },
    { id: 'fulfillment', label: 'Fulfillment (ready)', count: overview?.ready_to_ship ?? '–', active: operation === 'fulfillment', onClick: () => onOperation('fulfillment') },
    { id: 'assignment', label: 'Assignment exceptions', count: assignments?.unassigned_count ?? '–', active: operation === 'assignment', onClick: () => onOperation('assignment') },
  ]}/>{operation === 'production' ? <ProductionPage userId={userId} role="admin"/> : operation === 'fulfillment' ? <FulfillmentPage role="admin"/> : <AdminVendorWorkspacePanel/>}</>
}

function Overview({ revenueOnly, onOrders }: { revenueOnly: boolean; onOrders: () => void }) {
  const { data, error, reload } = useAdminData(getAdminOverview, true)
  const [recentFilter, setRecentFilter] = useState<DashboardOrderFilter>('all')
  const [dashboardRevision, setDashboardRevision] = useState(0)
  const refreshDashboard = () => { setDashboardRevision(value => value + 1); reload() }
  const operations: Array<[keyof AdminOverview, string]> = [['orders_today', 'Orders today · WIB'], ['pending_payment', 'Pending payment'], ['paid_orders', 'Paid orders'], ['production_queued', 'Production jobs queued'], ['production_in_progress', 'Production jobs in progress'], ['ready_to_ship', 'Ready to ship'], ['shipped', 'Shipped'], ['delivered', 'Delivered']]
  const revenue: Array<[keyof AdminOverview, string]> = [['paid_gross_sales', 'Paid gross sales'], ['discounts', 'Discounts'], ['shipping_collected', 'Shipping collected'], ['net_transaction_total', 'Net transaction total']]
  return <><AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <>
      {!revenueOnly ? <><section className="overview-section admin-needs-attention"><div className="operations-section-heading"><div><span className="admin-kicker">Needs Attention</span><h2>Pesanan yang perlu dipantau</h2></div><button type="button" className="admin-refresh-button" onClick={refreshDashboard}>Perbarui</button></div><div className="admin-attention-grid"><button type="button" className="admin-attention-card production" onClick={() => setRecentFilter('queue')}><span>Antrean produksi</span><strong>{data.production_queued}</strong><small>pesanan</small><b aria-hidden="true">→</b></button><button type="button" className="admin-attention-card ready" onClick={() => setRecentFilter('ready')}><span>Siap dikirim</span><strong>{data.ready_to_ship}</strong><small>pesanan</small><b aria-hidden="true">→</b></button><button type="button" className="admin-attention-card payment" onClick={() => setRecentFilter('unpaid')}><span>Menunggu pembayaran</span><strong>{data.pending_payment}</strong><small>pesanan</small><b aria-hidden="true">→</b></button></div></section><RecentOrders key={`${recentFilter}:${dashboardRevision}`} filter={recentFilter} onFilter={setRecentFilter} onOrders={onOrders}/><section className="overview-section admin-lower-metrics"><span className="admin-kicker">METRICS</span><h2>Today at the Lab</h2><div className="admin-metrics">{[operations[0], operations[2], ...operations.slice(6)].map(([key, title]) => <article key={key}><span>{title}</span><strong>{data[key]}</strong></article>)}</div></section></> : null}
      <h2>Revenue</h2><p className="admin-help">All-time orders currently Paid. Gross − discounts + shipping = net transaction total. Refunded orders are excluded; payment fees are not deducted.</p>
      <div className="admin-metrics">{revenue.map(([key, title]) => <article key={key}><span>{title}</span><strong>{formatPrice(Number(data[key]))}</strong></article>)}</div>
      <p className="admin-help">Today follows Asia/Jakarta. Other counts show current status. Updated {new Date(data.as_of).toLocaleString()}.</p>
    </> : null}
  </>
}

type DashboardOrderFilter = 'all' | 'unpaid' | 'queue' | 'production' | 'ready' | 'shipping' | 'complete'
const dashboardTabs: Array<[DashboardOrderFilter, string]> = [['all', 'Semua'], ['unpaid', 'Belum bayar'], ['production', 'Produksi'], ['ready', 'Siap dikirim'], ['shipping', 'Sedang dikirim'], ['complete', 'Selesai']]
const emptyAdminFilter: AdminOrderFilters = { search: '', payment: '', production: '', shipment: '', page: 0 }
async function loadDashboardOrders(filter: DashboardOrderFilter) {
  if (filter === 'queue') return getAdminOrders({ ...emptyAdminFilter, production: 'queued' })
  if (filter === 'production') {
    const [queued, active] = await Promise.all([getAdminOrders({ ...emptyAdminFilter, production: 'queued' }), getAdminOrders({ ...emptyAdminFilter, production: 'in_production' })])
    const rows = [...queued.rows, ...active.rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return { rows, count: queued.count + active.count }
  }
  const filters: Record<DashboardOrderFilter, AdminOrderFilters> = {
    all: emptyAdminFilter,
    unpaid: { ...emptyAdminFilter, payment: 'pending' },
    ready: { ...emptyAdminFilter, shipment: 'ready_to_ship' },
    shipping: { ...emptyAdminFilter, shipment: 'shipped' },
    complete: { ...emptyAdminFilter, shipment: 'delivered' },
    queue: { ...emptyAdminFilter, production: 'queued' },
    production: emptyAdminFilter,
  }
  return getAdminOrders(filters[filter])
}
function RecentOrders({ filter, onFilter, onOrders }: { filter: DashboardOrderFilter; onFilter: (filter: DashboardOrderFilter) => void; onOrders: () => void }) {
  const load = useCallback(() => loadDashboardOrders(filter), [filter])
  const { data, error, reload } = useAdminData(load, true)
  return <section className="overview-section admin-recent-orders"><div className="operations-section-heading"><h2>Recent Orders</h2><button type="button" onClick={onOrders}>Lihat semua →</button></div><nav className="admin-order-tabs" aria-label="Filter pesanan terbaru">{dashboardTabs.map(([id, title]) => { const active = filter === id || id === 'production' && filter === 'queue'; return <button type="button" key={id} className={active ? 'active' : ''} aria-pressed={active} onClick={() => onFilter(id)}>{title}</button> })}</nav><AdminLoad error={error} loading={!data && !error} reload={reload} showRefresh={false}/>{data?.rows.length === 0 ? <p>Tidak ada pesanan dalam tahap ini.</p> : null}<div className="production-list admin-order-list">{data?.rows.map(order => <AdminDashboardOrderCard key={order.id} order={order} onOrders={onOrders}/>)}</div></section>
}

function adminProcessStatus(order: import('../lib/admin').AdminOrder) {
  if (order.payment_status === 'pending') return 'Menunggu pembayaran'
  if (order.shipment_status === 'delivered') return 'Selesai'
  if (order.shipment_status === 'shipped') return 'Sedang dikirim'
  if (order.shipment_status === 'ready_to_ship') return 'Siap dikirim'
  if (order.production_status === 'in_production') return 'Sedang diracik'
  if (order.production_status === 'queued') return 'Antrean produksi'
  return 'Menunggu diracik'
}
function AdminDashboardOrderCard({ order, onOrders }: { order: import('../lib/admin').AdminOrder; onOrders: () => void }) {
  const status = adminProcessStatus(order)
  return <article className="admin-dashboard-order-card"><header><div><strong title={order.order_number}>{shortAdminOrderNumber(order.order_number)}</strong><time>{new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><b className={`admin-process-status ${order.shipment_status === 'delivered' ? 'complete' : order.production_status === 'in_production' ? 'production' : 'default'}`}>{status}</b></header><div className="admin-dashboard-order-products">{order.products.map((product, index) => <AdminDashboardProduct key={`${product.label}-${index}`} product={product}/>)}</div><footer><span>Status pembayaran <strong>{paymentLabel(order.payment_status)}</strong></span>{order.shipment?.courier || order.shipment?.tracking_number ? <span>{order.shipment.courier ? `${order.shipment.courier}${order.shipment.service ? ` · ${order.shipment.service}` : ''}` : ''}{order.shipment.tracking_number ? ` · Resi ${order.shipment.tracking_number}` : ''}</span> : null}<button type="button" onClick={onOrders}>Lihat detail →</button></footer></article>
}
function AdminDashboardProduct({ product }: { product: import('../lib/admin').AdminOrder['products'][number] }) {
  const title = product.bottle_count === 3 ? 'Play Set · Bundel 3 × 10 ml' : product.label
  const blends = product.blends?.length ? product.blends : [{ label: title, notes: product.notes }]
  return <section className="admin-dashboard-product">{blends.length > 1 ? blends.map((blend, index) => <div className="admin-dashboard-blend" key={`${blend.label ?? title}-${index}`}><strong className="admin-dashboard-blend-label">Parfum {index + 1}</strong><div className="admin-dashboard-product-heading"><strong>{blend.label ?? title}</strong><span>{product.volume_ml} ml · Jumlah {product.quantity}</span></div><AdminDashboardNotes notes={blend.notes}/></div>) : <><div className="admin-dashboard-product-heading"><strong>{title}</strong><span>{product.volume_ml} ml · Jumlah {product.quantity}</span></div><AdminDashboardNotes notes={product.notes}/></>}</section>
}
function AdminDashboardNotes({ notes }: { notes?: Array<{ phase: string; id?: string; name: string }> }) {
  if (!notes?.length) return <p className="admin-dashboard-detail-missing">Detail racikan belum tersedia</p>
  return <div className="admin-dashboard-notes">{(['top', 'middle', 'base'] as const).map(phase => { const note = notes.find(item => item.phase.toLowerCase() === phase); const asset = note?.id ? getNoteStickerAsset({ id: note.id }) : null; return <div key={phase}>{asset ? <img src={asset} alt=""/> : null}<strong>{note?.name ?? 'Detail racikan belum tersedia'}</strong></div> })}</div>
}
function shortAdminOrderNumber(value: string) { return value.length > 17 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value }
function paymentLabel(value: string) { return value === 'pending' ? 'Menunggu pembayaran' : value === 'paid' ? 'Lunas' : label(value) }

export function AdminLoad({ error, loading, reload, showRefresh = true }: { error: string; loading: boolean; reload: () => void; showRefresh?: boolean }) {
  return <div className="production-toolbar"><div>{error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading…</p> : null}</div>{showRefresh ? <button onClick={reload}>Refresh</button> : null}</div>
}
export function AdminPagination({ count, page, onPage }: { count: number; page: number; onPage: (page: number) => void }) {
  return <div className="production-pagination"><button disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span>{count} results · Page {page + 1}</span><button disabled={(page + 1) * 25 >= count} onClick={() => onPage(page + 1)}>Next</button></div>
}
function AdminOrders() {
  const initial: AdminOrderFilters = { search: '', payment: '', production: '', shipment: '', page: 0 }
  const [draft, setDraft] = useState(initial)
  const [filter, setFilter] = useState(initial)
  return <><form className="admin-filters calm-order-toolbar" onSubmit={event => { event.preventDefault(); setFilter({ ...draft, page: 0 }) }}>
    <label>Search orders or customer<input maxLength={100} value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })}/></label>
    <details className="operations-filter-details"><summary>Status filters</summary>{([['payment', ['pending', 'paid', 'failed', 'expired', 'refunded']], ['production', ['not_started', 'queued', 'in_production', 'completed']], ['shipment', ['not_created', 'pending', 'ready_to_ship', 'shipped', 'delivered']]] as const).map(([key, options]) => <label key={key}>{label(key)} status<select value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}><option value="">All</option>{options.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>)}</details>
    <button type="submit">Apply filters</button>
  </form><OrderResults key={JSON.stringify(filter)} filter={filter} onPage={page => setFilter(current => ({ ...current, page }))}/></>
}
function OrderResults({ filter, onPage }: { filter: AdminOrderFilters; onPage: (page: number) => void }) {
  const load = useCallback(() => getAdminOrders(filter), [filter])
  const { data, error, reload } = useAdminData(load, true)
  return <><AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data?.rows.length === 0 ? <p>No matching orders.</p> : null}
    <div className="production-list admin-order-list">{data?.rows.map(order => <OperationsOrderCard className="admin-order-card" key={order.id}>
      <OperationsOrderHeader orderNumber={order.order_number} time={new Date(order.created_at).toLocaleString()} status={label(order.payment_status)}/>
      <p><strong>{order.customer.name || 'Customer'}</strong> · {order.customer.email}</p>
      <div className="workspace-item-sizes" aria-label="Bottle sizes">{order.products.map((product, index) => <div key={index}><strong>{product.label}</strong><OperationsBottleSize volumeMl={product.volume_ml} bottleCount={product.bottle_count}/><span>Order quantity: {product.quantity}</span></div>)}</div>
      <dl className="admin-order-details"><div><dt>Grand total</dt><dd>{formatPrice(order.grand_total)}</dd></div><div><dt>Payment</dt><dd>{label(order.payment_status)}</dd></div><div><dt>Production</dt><dd>{label(order.production_status)} · {order.completed}/{order.item_count} jobs completed</dd></div><div><dt>Shipment</dt><dd>{label(order.shipment_status)}</dd></div></dl>
    </OperationsOrderCard>)}</div>
    {data ? <AdminPagination count={data.count} page={filter.page} onPage={onPage}/> : null}
  </>
}
function AdminCustomers() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState({ search: '', page: 0 })
  return <><form className="admin-filters" onSubmit={event => { event.preventDefault(); setFilter({ search, page: 0 }) }}><label>Search customers<input value={search} maxLength={100} onChange={event => setSearch(event.target.value)}/></label><button>Search</button></form>
    <CustomerResults key={JSON.stringify(filter)} search={filter.search} page={filter.page} onPage={page => setFilter(current => ({ ...current, page }))}/></>
}
function CustomerResults({ search, page, onPage }: { search: string; page: number; onPage: (page: number) => void }) {
  const load = useCallback(() => getAdminCustomers(search, page), [search, page])
  const { data, error, reload } = useAdminData(load, true)
  return <><AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data?.rows.length === 0 ? <p>No matching customers.</p> : null}
    <div className="production-list">{data?.rows.map(customer => <article className="customer-order" key={customer.id}><h2>{customer.name || 'Customer'}</h2><p>{customer.email}</p><p>Total orders: {customer.total_orders}</p><p>Last order: {customer.last_order ? new Date(customer.last_order).toLocaleString() : 'No orders yet'}</p></article>)}</div>
    {data ? <AdminPagination count={data.count} page={page} onPage={onPage}/> : null}
  </>
}
