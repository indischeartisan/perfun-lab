import { useState } from 'react'
import { OperationsPageHeader, OperationsStatusTabs } from '../components/OperationsPresentation'
import { FulfillmentPage } from './FulfillmentPage'
import { ProductionPage } from './ProductionPage'
import { getShipmentReadiness, type ShipmentStatus } from '../lib/shipments'
import { isReadyForShipping } from '../lib/operationReadiness'

type Stage = 'order' | 'production' | 'shipping' | 'done'
const shippingStatuses: ShipmentStatus[] = ['ready_to_ship', 'pending']
const doneStatuses: ShipmentStatus[] = ['shipped', 'delivered']

export function VendorWorkPage({ userId, initialStage = 'order' }: { userId: string; initialStage?: Stage }) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [doneView, setDoneView] = useState<'shipments' | 'jobs'>('shipments')
  const [notice, setNotice] = useState('')
  async function completed(orderNumber: string) {
    setNotice(`Job ${orderNumber} selesai. Memeriksa kesiapan pengiriman…`)
    try {
      const shipment = await getShipmentReadiness(orderNumber)
      if (isReadyForShipping(shipment)) {
        setNotice(`${orderNumber} siap diproses untuk pengiriman.`)
        setStage(current => current === 'production' ? 'shipping' : current)
      } else setNotice(`Job ${orderNumber} selesai. Order belum dinyatakan siap kirim oleh server.`)
    } catch {
      setNotice(`Job ${orderNumber} selesai, tetapi kesiapan pengiriman belum dapat diperiksa. Buka tab Kirim untuk memeriksa kembali.`)
    }
  }
  const stages: Array<{ id: Stage; label: string }> = [{ id: 'order', label: 'Order' }, { id: 'production', label: 'Produksi' }, { id: 'shipping', label: 'Kirim' }, { id: 'done', label: 'Selesai' }]
  return <section className="app-screen vendor-work-page"><OperationsPageHeader title="Pekerjaan">Pesanan yang ditugaskan untuk workspace Anda.</OperationsPageHeader>
    <OperationsStatusTabs label="Tahap pekerjaan" items={stages.map(item => ({ ...item, active: item.id === stage, onClick: () => setStage(item.id) }))}/>
    {notice ? <p role="status">{notice}</p> : null}
    {stage === 'done' ? <OperationsStatusTabs label="Completed history" items={[{ id: 'shipments', label: 'Shipments', active: doneView === 'shipments', onClick: () => setDoneView('shipments') }, { id: 'jobs', label: 'Production jobs', active: doneView === 'jobs', onClick: () => setDoneView('jobs') }]}/> : null}
    {stage === 'order' || stage === 'production' ? <ProductionPage key={stage} userId={userId} role="vendor" initialStatus={stage === 'order' ? 'queued' : 'in_production'} hideStatusTabs onStarted={() => setStage('production')} onCompleted={orderNumber => { void completed(orderNumber) }}/> : stage === 'done' && doneView === 'jobs' ? <ProductionPage key="completed" userId={userId} role="vendor" initialStatus="completed" hideStatusTabs/> : <FulfillmentPage key={stage} role="vendor" initialStatus={stage === 'shipping' ? 'ready_to_ship' : 'shipped'} availableStatuses={stage === 'shipping' ? shippingStatuses : doneStatuses} onShipped={() => { setNotice('Pengiriman tercatat oleh server.'); setStage('done') }}/>}
  </section>
}
