import { useState } from 'react'
import { OperationsPageHeader, OperationsStatusTabs } from '../components/OperationsPresentation'
import { VendorProductionPage } from './VendorProductionPage'
import { getShipmentReadiness } from '../lib/shipments'
import { isReadyForShipping } from '../lib/operationReadiness'
import { TestRunsPanel } from '../components/TestRunsPanel'
import { VendorShippingPage } from './VendorShippingPage'

type Stage = 'order' | 'production' | 'shipping' | 'done'

export function VendorWorkPage({ userId, initialStage = 'order' }: { userId: string; initialStage?: Stage }) {
  const [stage, setStage] = useState<Stage>(initialStage)
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
    <TestRunsPanel role="vendor" stage={stage}/>
    {stage === 'order' || stage === 'production' ? <VendorProductionPage key={stage} userId={userId} status={stage === 'order' ? 'queued' : 'in_production'} onStarted={() => setStage('production')} onCompleted={orderNumber => { void completed(orderNumber) }}/> : stage === 'done' ? <VendorProductionPage key="completed" userId={userId} status="completed"/> : <VendorShippingPage onShipped={() => setNotice('Pengiriman tercatat oleh server.')}/>} 
  </section>
}
