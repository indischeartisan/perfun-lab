import { useEffect, useRef, useState } from 'react'
import { ProductionAction } from '../components/WorkspacePresentation'
import { OperationsBottleSize, OperationsFormulaRow, OperationsOrderCard, OperationsOrderHeader, OperationsPageHeader, OperationsStatusTabs } from '../components/OperationsPresentation'
import { advanceProductionJob, listProductionJobs, type ProductionJob, type ProductionStatus } from '../lib/production'
import { errorMessage } from '../lib/supabase'

const labels: Record<ProductionStatus, string> = { queued: 'Queued', in_production: 'In Production', completed: 'Completed' }

export function ProductionPage({ userId, role, initialStatus = 'queued', hideStatusTabs = false, onStarted }: { userId: string; role: 'perfumer' | 'admin' | 'vendor'; initialStatus?: ProductionStatus; hideStatusTabs?: boolean; onStarted?: () => void }) {
  const [filter, setFilter] = useState<{ status: ProductionStatus; page: number }>({ status: initialStatus, page: 0 })
  const [summary, setSummary] = useState<Partial<Record<ProductionStatus, number>>>({})
  const [summaryRevision, setSummaryRevision] = useState(0)
  useEffect(() => {
    if (hideStatusTabs) return
    let active = true
    void Promise.all((Object.keys(labels) as ProductionStatus[]).map(status => listProductionJobs(status, 0).then(result => [status, result.count] as const))).then(results => {
      if (active) setSummary(Object.fromEntries(results) as Partial<Record<ProductionStatus, number>>)
    }).catch(() => { if (active) setSummary({}) })
    return () => { active = false }
  }, [role, summaryRevision, hideStatusTabs])
  return <section className="app-screen production-screen">
    <OperationsPageHeader title="Production Queue">{role === 'admin' ? 'View production progress across all jobs.' : role === 'vendor' ? 'Produce only orders assigned to your vendor workspace.' : 'Choose a job and craft each formula as ordered.'}</OperationsPageHeader>
    {!hideStatusTabs ? <OperationsStatusTabs label="Production status" items={(Object.keys(labels) as ProductionStatus[]).map(status => ({ id: status, label: labels[status], count: summary[status] ?? '–', active: filter.status === status, onClick: () => setFilter({ status, page: 0 }) }))}/> : null}
    <ProductionList key={`${userId}:${role}:${filter.status}:${filter.page}`} userId={userId} role={role} status={filter.status} page={filter.page} onPage={page => setFilter(current => ({ ...current, page }))} onSummaryChanged={() => setSummaryRevision(n => n + 1)} onStarted={onStarted}/>
  </section>
}

function ProductionList({ userId, role, status, page, onPage, onSummaryChanged, onStarted }: { userId: string; role: 'perfumer' | 'admin' | 'vendor'; status: ProductionStatus; page: number; onPage: (page: number) => void; onSummaryChanged: () => void; onStarted?: () => void }) {
  const [jobs, setJobs] = useState<ProductionJob[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true, fetching = false
    async function refresh() {
      if (fetching) return
      fetching = true
      try {
        const result = await listProductionJobs(status, page)
        if (active) { setJobs(result.jobs); setCount(result.count); setError('') }
      } catch (error) { if (active) { setJobs([]); setError(errorMessage(error)) } }
      finally { fetching = false; if (active) setLoading(false) }
    }
    void refresh()
    const onFocus = () => { void refresh() }
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    window.addEventListener('focus', onFocus)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [status, page, revision])
  return <>
    <div className="production-toolbar"><p role="status">{notice || (loading ? 'Loading production jobs...' : `${count} ${labels[status].toLowerCase()} jobs`)}</p><button onClick={() => setRevision(n => n + 1)}>Refresh</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {!loading && !error && !jobs.length ? <div className="screen-empty"><h2>No jobs on this page</h2><p>Paid order items appear here automatically.</p></div> : null}
    <div className="production-list">{jobs.map(job => <ProductionCard key={job.id} job={job} userId={userId} canWork={role !== 'admin'} onChanged={(message, action) => { setNotice(message); setRevision(n => n + 1); onSummaryChanged(); if (action === 'start') onStarted?.() }}/>)}</div>
    <div className="production-pagination"><button disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * 25 >= count} onClick={() => onPage(page + 1)}>Next</button></div>
  </>
}

function ProductionCard({ job, userId, canWork, onChanged }: { job: ProductionJob; userId: string; canWork: boolean; onChanged: (message: string, action: 'start' | 'complete') => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const mine = job.assigned_to === userId
  async function advance(action: 'start' | 'complete') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await advanceProductionJob(job.id, action)
      onChanged(`${job.order_number}: ${action === 'start' ? 'production started' : 'production completed'}.`, action)
    } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <OperationsOrderCard className="production-card">
    <OperationsOrderHeader orderNumber={job.order_number} status={labels[job.status]} time={new Date(job.ordered_at).toLocaleString()}/>
    <h2>{job.product_snapshot.label}</h2>
    <OperationsBottleSize volumeMl={job.product_snapshot.volume_ml} bottleCount={job.product_snapshot.bottle_count} detail/>
    <p>Order quantity: {job.quantity}</p>
    <p className="production-assignment">{job.assigned_to ? mine ? 'Assigned to you' : 'Assigned to another perfumer' : 'Unassigned'}</p>
    {job.formulas_snapshot.map((formula, index) => <OperationsFormulaRow key={index} formula={formula} label={`Bottle ${index + 1}${job.quantity > 1 ? ` · make ${job.quantity}` : ''}`}/>)}
    {job.started_at ? <p className="production-time">Started: <time dateTime={job.started_at}>{new Date(job.started_at).toLocaleString()}</time></p> : null}
    {job.completed_at ? <p className="production-time">Completed: <time dateTime={job.completed_at}>{new Date(job.completed_at).toLocaleString()}</time></p> : null}
    {!job.production_allowed ? <p role="status">On hold - this job cannot proceed.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {canWork && job.production_allowed && (job.status === 'queued' || (job.status === 'in_production' && mine)) ? <ProductionAction disabled={busy} onClick={() => advance(job.status === 'queued' ? 'start' : 'complete')} label={busy ? 'Saving...' : job.status === 'queued' ? 'Start Production' : 'Complete'}/> : null}
  </OperationsOrderCard>
}
