/* eslint-disable react-refresh/only-export-components -- this is a Vite-only fixture entrypoint. */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChevronLeft, PackageCheck, Sparkles } from 'lucide-react'
import { CustomerOrderCard, CustomerOrderDetail } from '../pages/OrdersPage'
import type { CustomerOrder } from '../lib/orders'
import '../styles.css'
import '../theme.css'
import '../orders.css'
import './ordersPreview.css'

const address = { recipient_name: 'Farras Agung Mujafar S.', phone: '0812 3456 7890', address_line: 'Jl. Melati No. 12, Cibeunying Kidul', city: 'Kota Bandung', province: 'Jawa Barat', postal_code: '40124', label: 'Rumah', is_default: true }
const paid = [{ id: 'payment-fixture', provider: 'doku', status: 'paid' as const, amount: 229000, paid_at: '2026-11-08T08:00:00.000Z' }]

const previewOrders: CustomerOrder[] = [
  { id: 'fixture-order-1', user_id: 'fixture-user', order_number: 'PF-5F8B7542E7A9E53DA', status: 'in_production', payment_status: 'paid', created_at: '2026-11-08T08:00:00.000Z', address_snapshot: address, subtotal: 199000, discount: 0, shipping: 30000, grand_total: 229000, shipping_quote_snapshot: null, payments: paid, shipment: null, order_items: [{ product_snapshot: { id: '30ml', label: 'Eau de Parfum', volume_ml: 30, bottle_count: 1 }, creations_snapshot: [{ id: 'blend-1', name: 'Blend 1', notes: [{ phase: 'top', note: { id: 'yuzu', name: 'Yuzu' } }, { phase: 'middle', note: { id: 'matcha', name: 'Matcha' } }, { phase: 'base', note: { id: 'amber', name: 'Amber' } }] }], quantity: 1, normal_unit_price: 199000, unit_price: 199000, line_total: 199000 }] },
  { id: 'fixture-order-2', user_id: 'fixture-user', order_number: 'PF-FE7722EE2EAA386F7', status: 'processing', payment_status: 'paid', created_at: '2026-11-08T07:53:00.000Z', address_snapshot: address, subtotal: 338000, discount: 30000, shipping: 30000, grand_total: 338000, shipping_quote_snapshot: null, payments: paid, shipment: null, order_items: [{ product_snapshot: { id: 'mix-set', label: 'Dua racikan', volume_ml: 10, bottle_count: 2 }, creations_snapshot: [{ id: 'blend-2', name: 'Blend 2', notes: [{ phase: 'top', note: { id: 'berries', name: 'Berries' } }, { phase: 'middle', note: { id: 'tea', name: 'Black Tea' } }, { phase: 'base', note: { id: 'coconut-milk', name: 'Coconut Milk' } }] }, { id: 'blend-3', name: 'Blend 3', notes: [{ phase: 'top', note: { id: 'jasmine', name: 'Jasmine' } }, { phase: 'middle', note: { id: 'green-leaves', name: 'Green Leaves' } }, { phase: 'base', note: { id: 'vanilla', name: 'Vanilla' } }] }], quantity: 1, normal_unit_price: 338000, unit_price: 308000, line_total: 308000 }] },
  { id: 'fixture-order-3', user_id: 'fixture-user', order_number: 'PF-7A91D3C4B9EF91E2F', status: 'shipped', payment_status: 'paid', created_at: '2026-11-07T03:21:00.000Z', address_snapshot: address, subtotal: 109000, discount: 0, shipping: 9000, grand_total: 118000, shipping_quote_snapshot: null, payments: paid, shipment: { status: 'shipped', courier: 'J&T Express', service: 'EZ', tracking_number: 'JT123456789ID', shipped_at: '2026-11-08T09:00:00.000Z', delivered_at: null } as CustomerOrder['shipment'], order_items: [{ product_snapshot: { id: '10ml', label: 'Eau de Parfum', volume_ml: 10, bottle_count: 1 }, creations_snapshot: [{ id: 'blend-4', name: 'Blend 4', notes: [{ phase: 'top', note: { id: 'pink-pepper', name: 'Pink Pepper' } }, { phase: 'middle', note: { id: 'peony', name: 'Peony' } }, { phase: 'base', note: { id: 'sandalwood', name: 'Sandalwood' } }] }], quantity: 1, normal_unit_price: 109000, unit_price: 109000, line_total: 109000 }] },
  { id: 'fixture-order-4', user_id: 'fixture-user', order_number: 'PF-2C3D5E7A91BC4AB8', status: 'completed', payment_status: 'paid', created_at: '2026-11-05T09:40:00.000Z', address_snapshot: address, subtotal: 199000, discount: 0, shipping: 30000, grand_total: 229000, shipping_quote_snapshot: null, payments: paid, shipment: { status: 'delivered', courier: 'AnterAja', service: 'REG', tracking_number: 'ANT987654321ID', shipped_at: '2026-11-06T07:00:00.000Z', delivered_at: '2026-11-07T08:00:00.000Z' } as CustomerOrder['shipment'], order_items: [{ product_snapshot: { id: '30ml', label: 'Eau de Parfum', volume_ml: 30, bottle_count: 1 }, creations_snapshot: [{ id: 'blend-5', name: 'Blend 5', notes: [{ phase: 'top', note: { id: 'jasmine', name: 'Jasmine' } }, { phase: 'middle', note: { id: 'amber', name: 'Amber' } }, { phase: 'base', note: { id: 'vanilla', name: 'Vanilla' } }] }], quantity: 1, normal_unit_price: 199000, unit_price: 199000, line_total: 199000 }] },
]

function OrdersPreview() {
  const [selected, setSelected] = useState<CustomerOrder | null>(null)
  return <div className="orders-preview-shell">
    <header className="orders-preview-header"><img src="/brand/perfun-lab-logo.webp" alt="Perfun Lab" /><span>LOCAL PREVIEW · DATA FIKTIF</span></header>
    <main className="orders-preview-main">
      {selected ? <CustomerOrderDetail order={selected} onBack={() => setSelected(null)} onRefresh={() => {}} /> : <section className="app-screen customer-orders-page"><header className="customer-orders-heading"><span>AKUN SAYA</span><div><h1>Pesanan Saya.</h1><button className="customer-orders-refresh" type="button"><Sparkles /> Perbarui</button></div><p>Fixture lokal dengan beberapa blend dan status pesanan.</p></header><p className="orders-preview-notice" role="status">Tidak ada login, request Supabase, atau data Production pada preview ini.</p><div className="customer-order-list">{previewOrders.map(order => <CustomerOrderCard key={order.id} order={order} onOpen={() => setSelected(order)} />)}</div></section>}
    </main>
    <nav className="orders-preview-bottom-nav" aria-label="Navigasi preview"><span><ChevronLeft /> Explore</span><span>Mix</span><span>Bag</span><span className="active"><PackageCheck /> Pesanan</span><span>Akun</span></nav>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><OrdersPreview /></StrictMode>)
