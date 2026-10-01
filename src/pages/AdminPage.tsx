import { useCallback, useState } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { getAdminCustomers, getAdminOrders, getAdminOverview, type AdminOrderFilters, type AdminOverview } from '../lib/admin'
import { formatPrice } from '../lib/currency'
import { AdminCatalogPanel } from '../components/AdminCatalogPanel'
import { ProductionPage } from './ProductionPage'
import { FulfillmentPage } from './FulfillmentPage'

const tabs = ['Overview', 'Orders', 'Customers', 'Notes', 'Products & Pricing', 'Production', 'Fulfillment', 'Revenue'] as const
type Tab = typeof tabs[number]
const label = (value: string) => value.replaceAll('_', ' ')
export function AdminPage({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('Overview')
  return <section className="app-screen admin-dashboard">
    <header className="screen-title"><span>PERFUN LAB OPERATIONS</span><h1>Admin Dashboard</h1><p>Orders, catalog and daily operations in one place.</p></header>
    <nav className="production-filters admin-tabs" aria-label="Admin sections">{tabs.map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value}</button>)}</nav>
    <div className="admin-content" key={tab}>
      {tab === 'Overview' || tab === 'Revenue' ? <Overview revenueOnly={tab === 'Revenue'}/> : null}
      {tab === 'Orders' ? <AdminOrders/> : null}
      {tab === 'Customers' ? <AdminCustomers/> : null}
      {tab === 'Notes' || tab === 'Products & Pricing' ? <AdminCatalogPanel section={tab === 'Notes' ? 'notes' : 'products'}/> : null}
      {tab === 'Production' ? <ProductionPage userId={userId} role="admin"/> : null}
      {tab === 'Fulfillment' ? <FulfillmentPage/> : null}
    </div>
  </section>
}

function Overview({ revenueOnly }: { revenueOnly: boolean }) {
  const { data, error, reload } = useAdminData(getAdminOverview, true)
  const operations: Array<[keyof AdminOverview, string]> = [['orders_today', 'Orders today · WIB'], ['pending_payment', 'Pending payment'], ['paid_orders', 'Paid orders'], ['production_queued', 'Production jobs queued'], ['production_in_progress', 'Production jobs in progress'], ['ready_to_ship', 'Ready to ship'], ['shipped', 'Shipped'], ['delivered', 'Delivered']]
  const revenue: Array<[keyof AdminOverview, string]> = [['paid_gross_sales', 'Paid gross sales'], ['discounts', 'Discounts'], ['shipping_collected', 'Shipping collected'], ['net_transaction_total', 'Net transaction total']]
  return <><AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <>
      {!revenueOnly ? <div className="admin-metrics">{operations.map(([key, title]) => <article key={key}><span>{title}</span><strong>{data[key]}</strong></article>)}</div> : null}
      <h2>Revenue</h2><p className="admin-help">All-time orders currently Paid. Gross − discounts + shipping = net transaction total. Refunded orders are excluded; payment fees are not deducted.</p>
      <div className="admin-metrics">{revenue.map(([key, title]) => <article key={key}><span>{title}</span><strong>{formatPrice(Number(data[key]))}</strong></article>)}</div>
      <p className="admin-help">Today follows Asia/Jakarta. Other counts show current status. Updated {new Date(data.as_of).toLocaleString()}.</p>
    </> : null}
  </>
}

export function AdminLoad({ error, loading, reload }: { error: string; loading: boolean; reload: () => void }) {
  return <div className="production-toolbar"><div>{error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading…</p> : null}</div><button onClick={reload}>Refresh</button></div>
}
export function AdminPagination({ count, page, onPage }: { count: number; page: number; onPage: (page: number) => void }) {
  return <div className="production-pagination"><button disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span>{count} results · Page {page + 1}</span><button disabled={(page + 1) * 25 >= count} onClick={() => onPage(page + 1)}>Next</button></div>
}
function AdminOrders() {
  const initial: AdminOrderFilters = { search: '', payment: '', production: '', shipment: '', page: 0 }
  const [draft, setDraft] = useState(initial)
  const [filter, setFilter] = useState(initial)
  return <><form className="admin-filters" onSubmit={event => { event.preventDefault(); setFilter({ ...draft, page: 0 }) }}>
    <label>Search orders or customer<input maxLength={100} value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })}/></label>
    {([['payment', ['pending', 'paid', 'failed', 'expired', 'refunded']], ['production', ['not_started', 'queued', 'in_production', 'completed']], ['shipment', ['not_created', 'pending', 'ready_to_ship', 'shipped', 'delivered']]] as const).map(([key, options]) => <label key={key}>{label(key)} status<select value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}><option value="">All</option>{options.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>)}
    <button type="submit">Apply filters</button>
  </form><OrderResults key={JSON.stringify(filter)} filter={filter} onPage={page => setFilter(current => ({ ...current, page }))}/></>
}
function OrderResults({ filter, onPage }: { filter: AdminOrderFilters; onPage: (page: number) => void }) {
  const load = useCallback(() => getAdminOrders(filter), [filter])
  const { data, error, reload } = useAdminData(load, true)
  return <><AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data?.rows.length === 0 ? <p>No matching orders.</p> : null}
    <div className="production-list">{data?.rows.map(order => <article className="customer-order" key={order.id}>
      <header><strong>{order.order_number}</strong><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString()}</time></header>
      <p><strong>{order.customer.name || 'Customer'}</strong> · {order.customer.email}</p>
      <ul className="fulfillment-products">{order.products.map((product, index) => <li key={index}>{product.label} · {product.bottle_count} × {product.volume_ml} ml · Qty {product.quantity}</li>)}</ul>
      <dl className="admin-order-details"><div><dt>Grand total</dt><dd>{formatPrice(order.grand_total)}</dd></div><div><dt>Payment</dt><dd>{label(order.payment_status)}</dd></div><div><dt>Production</dt><dd>{label(order.production_status)} · {order.completed}/{order.item_count} jobs completed</dd></div><div><dt>Shipment</dt><dd>{label(order.shipment_status)}</dd></div></dl>
    </article>)}</div>
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
