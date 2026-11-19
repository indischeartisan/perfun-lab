import { useCallback, useState, type ReactNode } from 'react'
import { AdminLoad } from '../pages/AdminPage'
import { useAdminData } from '../hooks/useAdminData'
import { getAdminFinance, type AdminFinance, type FinancePeriod } from '../lib/admin'
import { formatPrice } from '../lib/currency'
import { AdminVendorPaymentsPanel } from './AdminVendorPaymentsPanel'
import { AdminVendorFeeSettings } from './AdminVendorFeeSettings'

const periods: Array<[FinancePeriod, string]> = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['month', 'Bulan ini'], ['all', 'Semua waktu'], ['custom', 'Pilih tanggal']]
const money = (value: number) => formatPrice(value)
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`))

export function AdminFinancePanel() {
  const [period, setPeriod] = useState<FinancePeriod>('all')
  const [date, setDate] = useState('')
  const load = useCallback(() => getAdminFinance(period, period === 'custom' && date ? date : null), [period, date])
  const { data, error, reload } = useAdminData(load)
  return <section className="finance-page">
    <form className="finance-period-filter" onSubmit={event => { event.preventDefault(); reload() }}>
      <label>Periode<select value={period} onChange={event => setPeriod(event.target.value as FinancePeriod)}>{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {period === 'custom' ? <label>Tanggal WIB<input type="date" value={date} required onChange={event => setDate(event.target.value)}/></label> : null}
      <button type="submit">Terapkan</button>
    </form>
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <FinanceContent data={data}/> : null}
  </section>
}

function FinanceContent({ data }: { data: AdminFinance }) {
  const orderCards: Array<[string, number]> = [['Pemesan unik', data.orders.unique_customers], ['Jumlah pesanan', data.orders.orders], ['Sudah bayar · status saat ini', data.orders.paid_orders], ['Belum bayar · status saat ini', data.orders.unpaid_orders], ['Direfund · status saat ini', data.orders.refunded_orders]]
  const paymentCards: Array<[string, number]> = [['Penjualan produk setelah diskon', data.payments.product_sales_after_discount], ['Ongkir pelanggan', data.payments.customer_shipping], ['Total pembayaran pelanggan', data.payments.customer_payments]]
  return <>
    <p className="finance-period-note">Periode: {data.period === 'all' ? 'Semua waktu' : data.start_date && data.end_date ? `${dateLabel(data.start_date)}–${dateLabel(data.end_date)}` : '—'} · Batas tanggal Asia/Jakarta (WIB).</p>
    <FinanceSection title="Pesanan" note="Berdasarkan tanggal pesanan dibuat. Status pembayaran adalah status saat ini; pesanan direfund tidak dimasukkan ke Belum bayar."><Metrics cards={orderCards}/></FinanceSection>
    <FinanceSection title="Pembayaran pelanggan" note="Berdasarkan tanggal pembayaran berhasil. Percobaan bayar ulang untuk order yang sama hanya dihitung sekali. Ini total pembayaran pelanggan, bukan pendapatan bersih."><Metrics cards={paymentCards} money/></FinanceSection>
    <FinanceSection title="Pembayaran perfumer" note="Rekap baca-saja menurut tanggal pembayaran pelanggan berhasil, dalam WIB." actions={<AdminVendorFeeSettings compact/>}><AdminVendorPaymentsPanel/></FinanceSection>
    <details className="finance-section"><summary>Rincian per tanggal</summary><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Tanggal WIB</th><th>Pemesan unik</th><th>Pesanan</th><th>Sudah bayar</th><th>Belum bayar</th><th>Direfund</th><th>Produk setelah diskon</th><th>Ongkir pelanggan</th><th>Pembayaran pelanggan</th><th>Pembayaran perfumer</th></tr></thead><tbody>{data.daily.filter(row => Object.values(row).some(value => typeof value === 'number' && value !== 0)).reverse().map(row => <tr key={row.day}><td>{dateLabel(row.day)}</td><td>{row.unique_customers}</td><td>{row.orders}</td><td>{row.paid_orders}</td><td>{row.unpaid_orders}</td><td>{row.refunded_orders}</td><td>{money(row.product_sales_after_discount)}</td><td>{money(row.customer_shipping)}</td><td>{money(row.customer_payments)}</td><td>{money(row.vendor_paid)}</td></tr>)}</tbody></table></div><p className="finance-help">Tanggal ditampilkan terbaru lebih dulu bila ada aktivitas pada salah satu metrik.</p></details>
    <FinanceSection title="Data yang belum tercatat"><p className="finance-unavailable">Refund: nominal dan tanggal refund belum tercatat terpisah; tidak ditampilkan sebagai Rp0.</p><p className="finance-unavailable">Biaya payment gateway: belum tercatat sebagai angka terstruktur; tidak ditampilkan sebagai Rp0.</p><p className="finance-unavailable">Biaya Produk, Stok Botol, dan laba: pekerjaan terpisah dan tidak dihitung di halaman ini.</p></FinanceSection>
  </>
}

function FinanceSection({ title, note, children, actions }: { title: string; note?: string; children: ReactNode; actions?: ReactNode }) { return <section className="finance-section"><div className="admin-section-heading"><div><span className="admin-kicker">KEUANGAN</span><h2>{title}</h2>{note ? <p>{note}</p> : null}</div>{actions}</div>{children}</section> }
function Metrics({ cards, money: isMoney = false }: { cards: Array<[string, number]>; money?: boolean }) { return <div className="admin-metrics">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{isMoney ? money(value) : value}</strong></article>)}</div> }
