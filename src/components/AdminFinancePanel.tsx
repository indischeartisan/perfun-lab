import { useCallback, useState, type ReactNode } from 'react'
import { AdminLoad } from '../pages/AdminPage'
import { useAdminData } from '../hooks/useAdminData'
import { getAdminFinance, type AdminFinance, type FinancePeriod } from '../lib/admin'
import { formatPrice } from '../lib/currency'
import { AdminVendorPaymentsPanel } from './AdminVendorPaymentsPanel'

const periods: Array<[FinancePeriod, string]> = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['month', 'Bulan ini'], ['all', 'Semua waktu'], ['custom', 'Pilih tanggal']]
const money = (value: number) => formatPrice(value)
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`))

export function AdminFinancePanel() {
  const [period, setPeriod] = useState<FinancePeriod>('all')
  const [date, setDate] = useState('')
  const [showVendorFlow, setShowVendorFlow] = useState(false)
  const load = useCallback(() => getAdminFinance(period, period === 'custom' && date ? date : null), [period, date])
  const { data, error, reload } = useAdminData(load)
  return <section className="finance-page">
    <header className="screen-title"><span>KEUANGAN</span><h1>Keuangan</h1><p>Ringkasan pesanan, pembayaran pelanggan, dan pembayaran perfumer dalam WIB.</p></header>
    <form className="finance-period-filter" onSubmit={event => { event.preventDefault(); reload() }}>
      <label>Periode<select value={period} onChange={event => setPeriod(event.target.value as FinancePeriod)}>{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {period === 'custom' ? <label>Tanggal WIB<input type="date" value={date} required onChange={event => setDate(event.target.value)}/></label> : null}
      <button type="submit">Terapkan</button>
    </form>
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <FinanceContent data={data} onManageVendorPayments={() => setShowVendorFlow(value => !value)} showVendorFlow={showVendorFlow}/> : null}
  </section>
}

function FinanceContent({ data, onManageVendorPayments, showVendorFlow }: { data: AdminFinance; onManageVendorPayments: () => void; showVendorFlow: boolean }) {
  const orderCards: Array<[string, number]> = [['Pemesan unik', data.orders.unique_customers], ['Jumlah pesanan', data.orders.orders], ['Sudah bayar · status saat ini', data.orders.paid_orders], ['Belum bayar · status saat ini', data.orders.unpaid_orders], ['Direfund · status saat ini', data.orders.refunded_orders]]
  const paymentCards: Array<[string, number]> = [['Penjualan produk setelah diskon', data.payments.product_sales_after_discount], ['Ongkir pelanggan', data.payments.customer_shipping], ['Total pembayaran pelanggan', data.payments.customer_payments]]
  return <>
    <p className="finance-period-note">Periode: {data.period === 'all' ? 'Semua waktu' : data.start_date && data.end_date ? `${dateLabel(data.start_date)}–${dateLabel(data.end_date)}` : '—'} · Batas tanggal Asia/Jakarta (WIB).</p>
    <FinanceSection title="Pesanan" note="Berdasarkan tanggal pesanan dibuat. Status pembayaran adalah status saat ini; pesanan direfund tidak dimasukkan ke Belum bayar."><Metrics cards={orderCards}/></FinanceSection>
    <FinanceSection title="Pembayaran pelanggan" note="Berdasarkan tanggal pembayaran berhasil. Percobaan bayar ulang untuk order yang sama hanya dihitung sekali. Ini total pembayaran pelanggan, bukan pendapatan bersih."><Metrics cards={paymentCards} money/></FinanceSection>
    <FinanceSection title="Pembayaran perfumer" note="Saldo dan draf adalah posisi sekarang. Pembayaran tercatat memakai tanggal vendor_payouts.paid_at; tagihan baru per hari belum tersedia."><div className="admin-metrics"><article><span>Perlu dibayar sekarang · jasa</span><strong>{money(data.vendor.outstanding_service)}</strong></article><article><span>Perlu dibayar sekarang · penggantian ongkir</span><strong>{money(data.vendor.outstanding_shipping)}</strong></article><article><span>Perlu dibayar sekarang · total</span><strong>{money(data.vendor.outstanding_total)}</strong></article><article><span>Dalam draf pembayaran</span><strong>{money(data.vendor.draft_total)}</strong><small>Jasa {money(data.vendor.draft_service)} · Ongkir {money(data.vendor.draft_shipping)}</small></article><article><span>Pembayaran tercatat pada periode ini</span><strong>{money(data.vendor.paid_total)}</strong><small>Jasa {money(data.vendor.paid_service)} · Ongkir {money(data.vendor.paid_shipping)}</small></article></div><p className="finance-unavailable">Tagihan baru per hari: Belum tersedia — tanggal saat pesanan memenuhi syarat tagihan belum dapat ditentukan dengan andal.</p><button type="button" className="finance-action" onClick={onManageVendorPayments}>{showVendorFlow ? 'Sembunyikan alur pembayaran perfumer' : 'Kelola pembayaran perfumer'}</button></FinanceSection>
    <FinanceSection title="Rincian per tanggal"><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Tanggal WIB</th><th>Pemesan unik</th><th>Pesanan</th><th>Sudah bayar</th><th>Belum bayar</th><th>Direfund</th><th>Produk setelah diskon</th><th>Ongkir pelanggan</th><th>Pembayaran pelanggan</th><th>Pembayaran perfumer</th></tr></thead><tbody>{data.daily.length ? data.daily.map(row => <tr key={row.day}><td>{dateLabel(row.day)}</td><td>{row.unique_customers}</td><td>{row.orders}</td><td>{row.paid_orders}</td><td>{row.unpaid_orders}</td><td>{row.refunded_orders}</td><td>{money(row.product_sales_after_discount)}</td><td>{money(row.customer_shipping)}</td><td>{money(row.customer_payments)}</td><td>{money(row.vendor_paid)}</td></tr>) : <tr><td colSpan={10}>Belum ada data pada periode ini.</td></tr>}</tbody></table></div><p className="finance-help">Pemesan unik pada kartu Semua waktu dihitung langsung untuk seluruh periode, bukan penjumlahan pemesan unik harian.</p></FinanceSection>
    <FinanceSection title="Data yang belum tercatat"><p className="finance-unavailable">Refund: nominal dan tanggal refund belum tercatat terpisah; tidak ditampilkan sebagai Rp0.</p><p className="finance-unavailable">Biaya payment gateway: belum tercatat sebagai angka terstruktur; tidak ditampilkan sebagai Rp0.</p><p className="finance-unavailable">Biaya Produk, Stok Botol, dan laba: pekerjaan terpisah dan tidak dihitung di halaman ini.</p></FinanceSection>
    {showVendorFlow ? <AdminVendorPaymentsPanel/> : null}
  </>
}

function FinanceSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) { return <section className="finance-section"><div className="admin-section-heading"><div><span className="admin-kicker">KEUANGAN</span><h2>{title}</h2>{note ? <p>{note}</p> : null}</div></div>{children}</section> }
function Metrics({ cards, money: isMoney = false }: { cards: Array<[string, number]>; money?: boolean }) { return <div className="admin-metrics">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{isMoney ? money(value) : value}</strong></article>)}</div> }
