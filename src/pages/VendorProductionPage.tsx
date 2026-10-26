import { useEffect, useRef, useState } from 'react'
import { OperationsBottleSize, OperationsFormulaRow, OperationsOrderCard, OperationsOrderHeader, OperationsPageHeader } from '../components/OperationsPresentation'
import { ProductionAction } from '../components/WorkspacePresentation'
import { advanceProductionJob, listVendorProductionOrders, type ProductionJob, type ProductionStatus, type VendorOrderCursor, type VendorProductionOrder } from '../lib/production'
import { errorMessage } from '../lib/supabase'
import { matchesProductionAction } from '../lib/operationReadiness'
import { vendorProjectionError } from '../lib/vendorProjection'

const labels: Record<ProductionStatus, string> = { queued: 'Queued', in_production: 'In Production', completed: 'Completed' }

export function VendorProductionPage({ userId, status, onStarted, onCompleted }: { userId: string; status: ProductionStatus; onStarted?: () => void; onCompleted?: (orderNumber: string) => void }) {
  const [cursors, setCursors] = useState<Array<VendorOrderCursor | null>>([null])
  const [page, setPage] = useState(0)
  const cursor = cursors[page]
  return <section className="app-screen production-screen">
    <OperationsPageHeader title="Production Queue">Pesanan yang ditugaskan untuk workspace Anda.</OperationsPageHeader>
    <VendorOrderList key={`${status}:${page}:${cursor?.ordered_at ?? ''}:${cursor?.order_number ?? ''}`} userId={userId} status={status} cursor={cursor} page={page}
      onPrevious={() => setPage(current => current - 1)}
      onReset={() => { setCursors([null]); setPage(0) }}
      onNext={next => { setCursors(current => [...current.slice(0, page + 1), next]); setPage(current => current + 1) }}
      onChanged={(action, orderNumber) => {
        setCursors([null]); setPage(0)
        if (action === 'start') onStarted?.(); else onCompleted?.(orderNumber)
      }}/>
  </section>
}

function VendorOrderList({ userId, status, cursor, page, onPrevious, onNext, onReset, onChanged }: { userId: string; status: ProductionStatus; cursor: VendorOrderCursor | null; page: number; onPrevious: () => void; onNext: (cursor: VendorOrderCursor) => void; onReset: () => void; onChanged: (action: 'start' | 'complete', orderNumber: string) => void }) {
  const [orders, setOrders] = useState<VendorProductionOrder[]>([])
  const [next, setNext] = useState<VendorOrderCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true, fetching = false
    async function refresh() {
      if (fetching) return
      fetching = true
      try {
        const result = await listVendorProductionOrders(status, cursor)
        if (active) { setOrders(result.rows); setNext(result.has_more ? result.next_cursor : null); setError('') }
      } catch (cause) { if (active) { setOrders([]); setNext(null); setError(vendorProjectionError(cause)) } }
      finally { fetching = false; if (active) setLoading(false) }
    }
    void refresh()
    const onFocus = () => { void refresh() }
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    window.addEventListener('focus', onFocus)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [status, cursor, revision])
  return <>
    <div className="production-toolbar"><p role="status">{loading ? 'Loading orders…' : error ? 'Antrean tidak tersedia.' : `${orders.length} orders on this page`}</p><button type="button" disabled={loading} onClick={() => { setLoading(true); setError(''); if (page === 0) setRevision(n => n + 1); else onReset() }}>{error ? 'Coba lagi' : 'Refresh from first page'}</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {!loading && !error && !orders.length ? <div className="screen-empty"><h2>No orders on this page</h2><p>Assigned jobs appear when they reach this stage.</p></div> : null}
    <div className="production-list">{orders.map(order => <OperationsOrderCard key={order.order_number} className="production-card">
      <OperationsOrderHeader orderNumber={order.order_number} time={new Date(order.ordered_at).toLocaleString()}/>
      {order.jobs.map(job => <VendorOrderJob key={job.id} job={job} userId={userId} canWork={status !== 'completed'} onChanged={action => { setRevision(n => n + 1); onChanged(action, order.order_number) }}/>) }
    </OperationsOrderCard>)}</div>
    <div className="production-pagination"><button type="button" disabled={page === 0 || loading} onClick={onPrevious}>Previous</button><span>Page {page + 1}</span><button type="button" disabled={!next || loading} onClick={() => { if (next) onNext(next) }}>Next</button></div>
  </>
}

function VendorOrderJob({ job, userId, canWork, onChanged }: { job: ProductionJob; userId: string; canWork: boolean; onChanged: (action: 'start' | 'complete') => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const mine = job.assigned_to === userId
  async function advance(action: 'start' | 'complete') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await advanceProductionJob(job.id, action)
      if (!matchesProductionAction(action, result.status)) {
        throw new Error('The job has already changed on the server. Refresh the order before continuing.')
      }
      onChanged(action)
    }
    catch (cause) { setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="vendor-order-job" aria-label={`${job.product_snapshot.label}: ${labels[job.status]}`}>
    <h2>{job.product_snapshot.label}</h2><p><strong>{labels[job.status]}</strong></p>
    <OperationsBottleSize volumeMl={job.product_snapshot.volume_ml} bottleCount={job.product_snapshot.bottle_count} detail/>
    <p>Order quantity: {job.quantity}</p>
    {job.formulas_snapshot.map((formula, index) => <OperationsFormulaRow key={index} formula={formula} label={`Bottle ${index + 1}${job.quantity > 1 ? ` · make ${job.quantity}` : ''}`}/>)}
    {!job.production_allowed ? <p role="status">On hold - this job cannot proceed.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {canWork && job.production_allowed && (job.status === 'queued' || (job.status === 'in_production' && mine)) ? <ProductionAction disabled={busy} onClick={() => void advance(job.status === 'queued' ? 'start' : 'complete')} label={busy ? 'Saving...' : job.status === 'queued' ? 'Start Production' : 'Complete Production'}/> : null}
  </section>
}
