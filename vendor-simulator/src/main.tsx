import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clipboard, Factory, Printer, RotateCcw, WalletCards } from 'lucide-react'
import { OperationsBottleList, OperationsBottleSize, OperationsEmptyState, OperationsFormulaRow, OperationsOrderCard, OperationsOrderHeader, OperationsPageHeader, OperationsPageShell, OperationsShippingPanel, OperationsStatusTabs } from '../../src/components/OperationsPresentation'
import { addressText, advanceOrder, courierForProvince, initialState, loadState, orderText, saveState, serviceForCourier, shipOrder, validShipment, type Order, type Shipment, type Stage, type State } from './store'
import './vendor.css'

function App() {
  const [state, setState] = useState<State>(loadState)
  const [stage, setStage] = useState<Stage>('order')
  const [page, setPage] = useState<'work' | 'payments'>('work')
  useEffect(() => { saveState(state) }, [state])
  const update = (fn: (current: State) => State) => setState(current => fn(current))
  const advance = (order: Order, from: 'order' | 'production') => { update(current => advanceOrder(current, order.id, from)); setStage(from === 'order' ? 'production' : 'ship') }
  const ship = (order: Order, shipment: Shipment) => {
    if (!validShipment(order, shipment) || !window.confirm('Tandai ' + order.id + ' sebagai dikirim?')) return
    update(current => shipOrder(current, order.id, shipment)); setStage('done')
  }
  const stages: Array<{ id: Stage; label: string }> = [{ id: 'order', label: 'Order' }, { id: 'production', label: 'Produksi' }, { id: 'ship', label: 'Kirim' }, { id: 'done', label: 'Selesai' }]
  const rows = state.orders.filter(order => order.stage === stage)
  return <div className='vendor-app'>
    <header className='vendor-header'><strong>perfun lab.</strong><span>VENDOR SIMULATOR · DEMO</span><button className='reset' onClick={() => { if (window.confirm('Reset seluruh data demo di perangkat ini?')) { setState(initialState()); setStage('order'); setPage('work') } }}><RotateCcw size={16}/> Reset Demo</button></header>
    <main><OperationsPageShell className='vendor-content'>
      <nav className='vendor-nav' aria-label='Vendor navigation'><button className={page === 'work' ? 'active' : ''} onClick={() => setPage('work')}><Factory size={17}/> Pekerjaan</button><button className={page === 'payments' ? 'active' : ''} onClick={() => setPage('payments')}><WalletCards size={17}/> Payments</button></nav>
      {page === 'payments' ? <section><OperationsPageHeader eyebrow='DATA SINTETIS' title='Payments'>Riwayat payout simulasi, bukan pembayaran nyata.</OperationsPageHeader><div className='order-list'>{state.payouts.map(payout => <article className='payout-card' key={payout.id}><strong>{payout.id}</strong><span>{payout.status}</span><p>{payout.period}</p><b>Rp{payout.amount.toLocaleString('id-ID')}</b></article>)}</div></section> : <>
        <OperationsPageHeader eyebrow='DATA SINTETIS' title='Pekerjaan'>Latihan workflow tanpa transaksi atau pengiriman nyata.</OperationsPageHeader>
        <OperationsStatusTabs label='Tahap pekerjaan' items={stages.map(item => ({ ...item, active: item.id === stage, count: state.orders.filter(order => order.stage === item.id).length, onClick: () => setStage(item.id) }))}/>
        <div className='order-list'>{rows.length ? rows.map(order => stage === 'ship' ? <ShippingCard key={order.id} order={order} onShip={ship}/> : <WorkCard key={order.id} order={order} onAdvance={advance}/>) : <OperationsEmptyState title='Tidak ada pekerjaan'>Tidak ada pesanan pada tahap ini.</OperationsEmptyState>}</div>
      </>}
    </OperationsPageShell></main>
  </div>
}

function Identity({ order }: { order: Order }) {
  const status: Record<Stage, string> = { order: 'Order baru', production: 'Dalam produksi', ship: 'Siap dikirim', done: 'Dikirim' }
  return <><OperationsOrderHeader orderNumber={order.id} status={status[order.stage]} time={order.created}/><div className='customer'><strong>{order.name}</strong><span>{order.items.length} item</span></div></>
}
function Items({ order }: { order: Order }) {
  return <OperationsBottleList>{order.items.map(item => <section className='item' key={item.id}><header><strong>{item.name}</strong><OperationsBottleSize volumeMl={item.volume} bottleCount={item.playSet ? item.formulas.length : item.quantity} playSet={item.playSet}/></header><div className='formula-list'>{item.formulas.map((formula, index) => <OperationsFormulaRow key={index} label={(item.playSet ? 'Botol ' + (index + 1) : 'Formula') + ' · ' + item.volume + ' ml'} formula={formula}/>)}</div></section>)}</OperationsBottleList>
}
function WorkCard({ order, onAdvance }: { order: Order; onAdvance: (order: Order, from: 'order' | 'production') => void }) {
  const action = order.stage === 'order' || order.stage === 'production' ? order.stage : null
  return <OperationsOrderCard action={action ? <button className='primary' onClick={() => onAdvance(order, action)}>{action === 'order' ? 'Mulai Produksi' : 'Selesai Produksi'}</button> : undefined}><Identity order={order}/><Items order={order}/>{order.shipment ? <p className='shipment-summary'>{order.shipment.courier} · {order.shipment.service} · {order.shipment.tracking}</p> : null}</OperationsOrderCard>
}
function ShippingCard({ order, onShip }: { order: Order; onShip: (order: Order, shipment: Shipment) => void }) {
  const courier = courierForProvince(order.province)
  const [service, setService] = useState('')
  const [tracking, setTracking] = useState('')
  const [cost, setCost] = useState('')
  const [feedback, setFeedback] = useState('')
  const shipment: Shipment = { courier, service, tracking, cost: Number(cost) }
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setFeedback('Berhasil disalin.') } catch { setFeedback('Tidak dapat menyalin. Periksa izin clipboard.') } }
  return <OperationsShippingPanel><Identity order={order}/><Items order={order}/><p className='address'>{addressText(order)}</p><p className='hint'>Kurir berdasarkan provinsi. Nama layanan hanya simulasi, bukan ketersediaan live.</p><div className='documents'><button onClick={() => void copy(addressText(order))}><Clipboard size={15}/> Copy Address</button><button onClick={() => void copy(orderText(order))}><Clipboard size={15}/> Copy Order</button><button onClick={() => printDemo(order, 'Label A6')}><Printer size={15}/> Print Label A6</button><button onClick={() => printDemo(order, 'Packing Slip A6')}><Printer size={15}/> Print Packing Slip A6</button></div>{feedback && <p role='status'>{feedback}</p>}<div className='shipping-fields'><label>Kurir<select value={courier} disabled><option>{courier}</option></select></label><label>Layanan<select value={service} onChange={event => setService(event.target.value)}><option value=''>Pilih layanan</option><option value={serviceForCourier(courier)}>{serviceForCourier(courier)}</option></select></label><label>Nomor resi<input value={tracking} onChange={event => setTracking(event.target.value)}/></label><label>Biaya aktual<input type='number' min='1' value={cost} onChange={event => setCost(event.target.value)}/></label></div><button className='primary' disabled={!validShipment(order, shipment)} onClick={() => onShip(order, shipment)}>Tandai Dikirim</button></OperationsShippingPanel>
}
function printDemo(order: Order, title: string) {
  const popup = window.open('', '_blank', 'popup,width=420,height=600')
  if (!popup) return
  popup.opener = null
  popup.document.title = 'DEMO ' + title
  const style = popup.document.createElement('style')
  style.textContent = '@page{size:A6;margin:8mm}body{font:12px sans-serif}pre{white-space:pre-wrap}.demo{font-weight:900}'
  const marker = popup.document.createElement('p'); marker.className = 'demo'; marker.textContent = 'DEMO — NOT FOR FULFILLMENT'
  const heading = popup.document.createElement('h1'); heading.textContent = title
  const content = popup.document.createElement('pre'); content.textContent = orderText(order)
  popup.document.head.append(style); popup.document.body.append(marker, heading, content); popup.print()
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
