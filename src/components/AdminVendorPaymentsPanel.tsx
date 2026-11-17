import { useCallback, useState } from 'react'
import { AdminLoad } from '../pages/AdminPage'
import { useAdminData } from '../hooks/useAdminData'
import { getAdminPayoutRecap, type PayoutRecap, type PayoutRecapOrder, type PayoutRecapPeriod } from '../lib/payouts'
import { formatPrice } from '../lib/currency'

const periodLabels: Record<PayoutRecapPeriod, string> = { day: 'Hari ini (WIB)', week: 'Mingguan (WIB)', month: 'Bulanan (WIB)' }

function OrderList({ orders }: { orders: PayoutRecapOrder[] }) {
  return <ul className="fulfillment-products">{orders.map(order => <li key={order.order_id}><strong>{order.order_number}</strong><span>Jasa pembuatan: {formatPrice(order.vendor_fee_amount)}</span><span>Penggantian ongkir: {formatPrice(order.shipping_reimbursement)}</span><span>Total harus dibayar: {formatPrice(order.total_amount)}</span></li>)}</ul>
}

export function PayoutRecap({ data, vendorView = false }: { data: PayoutRecap; vendorView?: boolean }) {
  const byVendor = data.ready_orders.reduce<Record<string, PayoutRecapOrder[]>>((groups, order) => { (groups[order.vendor_id] ??= []).push(order); return groups }, {})
  return <>
    <div className="admin-metrics"><article><span>Pesanan siap dibayar</span><strong>{data.ready_count}</strong></article><article><span>Total jasa</span><strong>{formatPrice(data.ready_service)}</strong></article><article><span>Total ongkir</span><strong>{formatPrice(data.ready_shipping)}</strong></article><article><span>Total yang harus dibayar {data.period === 'day' ? 'hari ini' : 'pada periode ini'}</span><strong>{formatPrice(data.ready_total)}</strong></article></div>
    <p className="finance-help">Total siap ditransfer dari semua tanggal: <strong>{formatPrice(data.all_ready_total)}</strong> · {data.all_ready_count} pesanan. Rekap ini baca-saja; riwayat pembayaran yang sudah ada tetap terpisah.</p>
    {!data.ready_orders.length ? <p className="screen-empty-copy">Belum ada pesanan dengan tanggal siap bayar pada periode ini.</p> : Object.entries(byVendor).map(([vendorId, orders]) => <details className="admin-editor payout-group" key={vendorId}><summary><strong>{vendorView ? 'Pesanan siap dibayar' : (orders[0].vendor.name || orders[0].vendor.email || vendorId)}</strong><span>{orders.length} pesanan · Jasa {formatPrice(orders.reduce((sum, order) => sum + order.vendor_fee_amount, 0))} · Ongkir {formatPrice(orders.reduce((sum, order) => sum + order.shipping_reimbursement, 0))} · Total {formatPrice(orders.reduce((sum, order) => sum + order.total_amount, 0))}</span></summary><OrderList orders={orders}/></details>)}
    {data.older_orders.length ? <details className="admin-editor"><summary><strong>Tagihan lama</strong><span>{data.older_count} pesanan · {formatPrice(data.older_total)}</span></summary><p>Pesanan siap bayar sebelum periode terpilih; tidak dicampur ke total periode ini.</p><OrderList orders={data.older_orders}/></details> : null}
    {data.undated_orders.length ? <details className="admin-editor"><summary><strong>Tanpa tanggal siap bayar</strong><span>{data.undated_count} pesanan · {formatPrice(data.undated_total)}</span></summary><p>Tanggal pertama kali siap bayar tidak dapat dibuktikan dari data historis. Nominal tidak dimasukkan ke rekap harian.</p><OrderList orders={data.undated_orders}/></details> : null}
    {data.review_orders.length ? <details className="admin-editor"><summary><strong>Perlu ditinjau</strong><span>{data.review_count} pesanan</span></summary><p>Pesanan tidak dihitung sampai pembayar ongkir atau tarif RajaOngkir asli dapat dipastikan.</p><ul className="fulfillment-products">{data.review_orders.map(order => <li key={order.order_id}><strong>{order.order_number}</strong><span>{order.review_reason}</span></li>)}</ul></details> : null}
  </>
}

export function AdminVendorPaymentsPanel() {
  const [period, setPeriod] = useState<PayoutRecapPeriod>('day')
  const load = useCallback(() => getAdminPayoutRecap(period), [period])
  const { data, error, reload } = useAdminData(load)
  return <section className="vendor-workspace-panel" aria-label="Pembayaran perfumer"><section className="admin-section-heading"><div><span className="admin-kicker">REKAP BACA-SAJA</span><h2>Rekap pembayaran perfumer</h2><p>Pesanan dikelompokkan menurut tanggal pertama kali siap dibayar, dalam WIB.</p></div><label>Rekap periode<select aria-label="Rekap periode" value={period} onChange={event => setPeriod(event.target.value as PayoutRecapPeriod)}>{(Object.keys(periodLabels) as PayoutRecapPeriod[]).map(value => <option key={value} value={value}>{periodLabels[value]}</option>)}</select></label></section><AdminLoad error={error} loading={!data && !error} reload={reload}/>{data ? <PayoutRecap data={data}/> : null}</section>
}
