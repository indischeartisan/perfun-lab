import { useState } from 'react'
import { OperationsPageHeader, OperationsStatusTabs } from '../components/OperationsPresentation'
import { FulfillmentPage } from './FulfillmentPage'
import { ProductionPage } from './ProductionPage'
import type { ShipmentStatus } from '../lib/shipments'

type Stage = 'order' | 'production' | 'shipping' | 'done'
const shippingStatuses: ShipmentStatus[] = ['ready_to_ship', 'pending']
const doneStatuses: ShipmentStatus[] = ['shipped', 'delivered']

export function VendorWorkPage({ userId, initialStage = 'order' }: { userId: string; initialStage?: Stage }) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [doneView, setDoneView] = useState<'shipments' | 'jobs'>('shipments')
  const stages: Array<{ id: Stage; label: string }> = [{ id: 'order', label: 'Order' }, { id: 'production', label: 'Produksi' }, { id: 'shipping', label: 'Kirim' }, { id: 'done', label: 'Selesai' }]
  return <section className="app-screen vendor-work-page"><OperationsPageHeader title="Pekerjaan">Pesanan yang ditugaskan untuk workspace Anda.</OperationsPageHeader>
    <OperationsStatusTabs label="Tahap pekerjaan" items={stages.map(item => ({ ...item, active: item.id === stage, onClick: () => setStage(item.id) }))}/>
    {stage === 'done' ? <OperationsStatusTabs label="Completed history" items={[{ id: 'shipments', label: 'Shipments', active: doneView === 'shipments', onClick: () => setDoneView('shipments') }, { id: 'jobs', label: 'Production jobs', active: doneView === 'jobs', onClick: () => setDoneView('jobs') }]}/> : null}
    {stage === 'order' || stage === 'production' ? <ProductionPage key={stage} userId={userId} role="vendor" initialStatus={stage === 'order' ? 'queued' : 'in_production'} hideStatusTabs onStarted={() => setStage('production')}/> : stage === 'done' && doneView === 'jobs' ? <ProductionPage key="completed" userId={userId} role="vendor" initialStatus="completed" hideStatusTabs/> : <FulfillmentPage key={stage} role="vendor" initialStatus={stage === 'shipping' ? 'ready_to_ship' : 'shipped'} availableStatuses={stage === 'shipping' ? shippingStatuses : doneStatuses}/>}
  </section>
}
