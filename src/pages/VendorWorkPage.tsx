import { useState } from 'react'
import { OperationsPageHeader, OperationsStatusTabs } from '../components/OperationsPresentation'
import { VendorProductionPage } from './VendorProductionPage'
import { getShipmentReadiness } from '../lib/shipments'
import { isReadyForShipping } from '../lib/operationReadiness'
import { TestRunsPanel } from '../components/TestRunsPanel'
import { VendorShippingPage } from './VendorShippingPage'

type Stage = 'order' | 'production' | 'ready_to_ship' | 'shipped' | 'done'

export function VendorWorkPage({ userId, initialStage = 'order' }: { userId: string; initialStage?: Stage }) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [notice, setNotice] = useState('')
  async function completed(orderNumber: string) {
    setNotice(`Job ${orderNumber} selesai. Memeriksa kesiapan pengiriman…`)
    try {
      const shipment = await getShipmentReadiness(orderNumber)
      if (isReadyForShipping(shipment)) {
        setNotice(`${orderNumber} siap diproses untuk pengiriman.`)
        setStage(current => current === 'production' ? 'ready_to_ship' : current)
      } else setNotice(`Job ${orderNumber} selesai. Order belum dinyatakan siap kirim oleh server.`)
    } catch {
      setNotice(`Job ${orderNumber} selesai, tetapi kesiapan pengiriman belum dapat diperiksa. Buka tab Siap dikirim untuk memeriksa kembali.`)
    }
  }
  const stages: Array<{ id: Stage; label: string }> = [
    { id: 'order', label: 'Order' },
    { id: 'production', label: 'Produksi' },
    { id: 'ready_to_ship', label: 'Siap dikirim' },
    { id: 'shipped', label: 'Sedang dikirim' },
    { id: 'done', label: 'Selesai' },
  ]
  return <section className="app-screen vendor-work-page"><OperationsPageHeader title="Pekerjaan">Pesanan yang ditugaskan untuk workspace Anda.</OperationsPageHeader>
    <OperationsStatusTabs label="Tahap pekerjaan" items={stages.map(item => ({ ...item, active: item.id === stage, onClick: () => setStage(item.id) }))}/>
    {notice ? <p role="status">{notice}</p> : null}
    <TestRunsPanel role="vendor" stage={stage === 'ready_to_ship' || stage === 'shipped' ? 'shipping' : stage}/>
    {stage === 'order' || stage === 'production' ? <VendorProductionPage key={stage} userId={userId} status={stage === 'order' ? 'queued' : 'in_production'} onStarted={() => setStage('production')} onCompleted={orderNumber => { void completed(orderNumber) }}/> : <VendorShippingPage key={stage} status={stage === 'done' ? 'delivered' : stage} onShipped={() => { setNotice('Pengiriman tercatat oleh server.'); setStage('shipped') }}/>}
  </section>
}
