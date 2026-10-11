import { useEffect, useRef, useState } from 'react'
import { advanceProductionJob, listProductionJobs, type ProductionJob, type ProductionStatus } from '../lib/production'
import { errorMessage } from '../lib/supabase'

const labels: Record<ProductionStatus, string> = { queued: 'Queued', in_production: 'In Production', completed: 'Completed' }

export function ProductionPage({ userId, role }: { userId: string; role: 'perfumer' | 'admin' | 'vendor' }) {
  const [filter, setFilter] = useState<{ status: ProductionStatus; page: number }>({ status: 'queued', page: 0 })
  return <section className="app-screen production-screen">
    <header className="screen-title"><span>THE LAB</span><h1>Production Queue</h1><p>{role === 'admin' ? 'View production progress across all jobs.' : role === 'vendor' ? 'Produce only orders assigned to your vendor workspace.' : 'Choose a job and craft each formula as ordered.'}</p></header>
    <nav className="production-filters" aria-label="Production status">
      {(Object.keys(labels) as ProductionStatus[]).map(status => <button key={status} aria-pressed={filter.status === status} onClick={() => setFilter({ status, page: 0 })}>{labels[status]}</button>)}
    </nav>
    <ProductionList key={`${userId}:${role}:${filter.status}:${filter.page}`} userId={userId} role={role} status={filter.status} page={filter.page} onPage={page => setFilter(current => ({ ...current, page }))}/>
  </section>
}

function ProductionList({ userId, role, status, page, onPage }: { userId: string; role: 'perfumer' | 'admin' | 'vendor'; status: ProductionStatus; page: number; onPage: (page: number) => void }) {
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
    <div className="production-toolbar"><p role="status">{notice || (loading ? 'Loading production jobs…' : `${count} ${labels[status].toLowerCase()} jobs`)}</p><button onClick={() => setRevision(n => n + 1)}>Refresh</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {!loading && !error && !jobs.length ? <div className="screen-empty"><h2>No jobs on this page</h2><p>Paid order items appear here automatically.</p></div> : null}
    <div className="production-list">{jobs.map(job => <ProductionCard key={job.id} job={job} userId={userId} canWork={role !== 'admin'} onChanged={message => { setNotice(message); setRevision(n => n + 1) }}/>)}</div>
    <div className="production-pagination"><button disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * 25 >= count} onClick={() => onPage(page + 1)}>Next</button></div>
  </>
}

function ProductionCard({ job, userId, canWork, onChanged }: { job: ProductionJob; userId: string; canWork: boolean; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const mine = job.assigned_to === userId
  async function advance(action: 'start' | 'complete') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await advanceProductionJob(job.id, action)
      onChanged(`${job.order_number}: ${action === 'start' ? 'production started' : 'production completed'}.`)
    } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <article className="customer-order production-card">
    <header><strong>{job.order_number}</strong><time dateTime={job.ordered_at}>{new Date(job.ordered_at).toLocaleString()}</time><b className="order-status">{labels[job.status]}</b></header>
    <h2>{job.product_snapshot.label}</h2>
    <p>{job.product_snapshot.bottle_count} × {job.product_snapshot.volume_ml} ml · Quantity: {job.quantity}</p>
    <p className="production-assignment">{job.assigned_to ? mine ? 'Assigned to you' : 'Assigned to another perfumer' : 'Unassigned'}</p>
    {job.formulas_snapshot.map((formula, index) => <section className="production-formula" key={index} aria-label={`Bottle ${index + 1} formula`}>
      <h3>Bottle {index + 1}{job.quantity > 1 ? ` · make ${job.quantity}` : ''}</h3>
      <dl>{(['top', 'middle', 'base'] as const).map(phase => <div key={phase}><dt>{phase === 'middle' ? 'Mid' : phase === 'top' ? 'Top' : 'Base'} notes</dt><dd>{formula[phase] ?? 'Snapshot unavailable'}</dd></div>)}</dl>
    </section>)}
    {job.started_at ? <p className="production-time">Started: <time dateTime={job.started_at}>{new Date(job.started_at).toLocaleString()}</time></p> : null}
    {job.completed_at ? <p className="production-time">Completed: <time dateTime={job.completed_at}>{new Date(job.completed_at).toLocaleString()}</time></p> : null}
    {!job.production_allowed ? <p role="status">On hold — this job cannot proceed.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {canWork && job.production_allowed && (job.status === 'queued' || (job.status === 'in_production' && mine)) ? <button className="orders-build" disabled={busy} onClick={() => advance(job.status === 'queued' ? 'start' : 'complete')}>{busy ? 'Saving…' : job.status === 'queued' ? 'Start Production' : 'Complete'}</button> : null}
  </article>
}
