import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PaymentActions } from '../components/PaymentActions'
import type { CustomerOrder } from '../lib/orders'
import '../styles.css'
import '../button-color-tokens.css'
import '../theme.css'
import '../orders.css'
import '../cloud.css'

const baseOrder: CustomerOrder = { id: 'expiry-preview-order', user_id: 'expiry-preview-user', order_number: 'PF-EXPIRY-PREVIEW', public_order_number: 'PF-000999', status: 'pending_payment', payment_status: 'pending', payment_deadline_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date().toISOString(), address_snapshot: {} as CustomerOrder['address_snapshot'], subtotal: 109000, discount: 0, shipping: 0, grand_total: 109000, shipping_quote_snapshot: null, order_items: [], payments: [], shipment: null }

function Preview() {
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 3600000).toISOString())
  return <main style={{ maxWidth: 720, margin: '40px auto', padding: 20 }}><PaymentActions order={{ ...baseOrder, payment_deadline_at: deadline }} onRefresh={() => {}} /><button type="button" data-testid="expire" onClick={() => setDeadline(new Date(Date.now() - 1000).toISOString())}>Simulasikan kedaluwarsa</button></main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
