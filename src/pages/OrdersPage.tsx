import { useEffect, useState } from 'react'
import { listOrders, type CustomerOrder } from '../lib/orders'
import { errorMessage } from '../lib/supabase'
import { OrderLines, OrderTotals } from '../components/CheckoutScreens'
import { AddressText } from '../components/AddressBook'
import { PaymentActions } from '../components/PaymentActions'
import { ShipmentStatus } from '../components/ShipmentStatus'

export function OrdersPage({ userId, onLogin, onBuild }: { userId?: string; onLogin: () => void; onBuild: () => void }) {
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!userId) return
    let active = true
    let pending = true
    const refresh = () => listOrders().then(rows => { if (active) { setOrders(rows); setError(''); pending = rows.some(order => order.payment_status === 'pending' || (order.payment_status === 'paid' && order.shipment?.status !== 'delivered')) } }).catch(error => { if (active) { setError(errorMessage(error)); pending = false } }).finally(() => { if (active) setLoading(false) })
    void refresh()
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    const timer = window.setInterval(() => { if (pending && !document.hidden) void refresh() }, 15000)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [userId, attempt])
  return <section className="app-screen"><header className="screen-title"><span>YOUR ORDERS</span><h1>Orders</h1><p>Your fragrances and delivery details, saved with each order.</p></header>
    {!userId ? <div className="screen-empty"><h2>Sign in to see your orders</h2><button onClick={onLogin}>Continue with email</button></div> : <>
      {error ? <p role="alert">{error} <button onClick={() => { setError(''); setLoading(true); setAttempt(n => n + 1) }}>Retry</button></p> : null}
      {loading ? <p role="status">Loading orders…</p> : !orders.length && !error ? <div className="screen-empty"><h2>No orders yet</h2><button onClick={onBuild}>Choose a creation</button></div> : <div className="order-list">{orders.map(order => <article className="customer-order" key={order.id}><header><strong>{order.order_number}</strong><time>{new Date(order.created_at).toLocaleString()}</time><b className="order-status">{order.status.replaceAll('_', ' ')}</b></header><PaymentActions order={order} onRefresh={() => setAttempt(n => n + 1)}/><ShipmentStatus shipment={order.shipment}/><OrderLines items={order.order_items}/><div className="checkout-summary"><OrderTotals totals={order}/></div><details><summary>Delivery address</summary><AddressText address={order.address_snapshot}/></details></article>)}</div>}
    </>}
  </section>
}
