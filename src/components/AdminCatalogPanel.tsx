import { useRef, useState, type FormEvent } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { getAdminCatalog, saveAdminNote, saveAdminProduct, type AdminNote, type AdminPhase, type AdminProduct } from '../lib/admin'
import { errorMessage } from '../lib/supabase'
import type { NoteLayer } from '../types'

const phases: NoteLayer[] = ['top', 'middle', 'base']
export function AdminCatalogPanel({ section }: { section: 'notes' | 'products' }) {
  const { data, error, reload } = useAdminData(getAdminCatalog)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  function saved() { setNotice('Catalog saved.'); reload() }
  return <><div className="production-toolbar"><p>{section === 'notes' ? 'Manage note availability and allowed phases.' : 'Prices are in whole rupiah. Leave sale price empty to remove it.'}</p><button onClick={reload}>Reload catalog</button></div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading catalog…</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {section === 'notes' ? <label className="admin-search">Find a note<input value={search} onChange={event => setSearch(event.target.value)}/></label> : null}
    <div className="production-list">{section === 'notes' ? data?.notes.filter(note => `${note.name} ${note.category}`.toLowerCase().includes(search.toLowerCase())).map(note => <details className="admin-editor" key={`${note.id}:${note.version}`}><summary>{note.name} · {note.active ? 'Active' : 'Inactive'} · {note.category}</summary><NoteEditor note={note} onSaved={saved}/></details>) : data?.products.map(product => <ProductEditor key={`${product.id}:${product.version}`} product={product} onSaved={saved}/>)}</div>
    <p className="admin-help">Existing orders keep their original snapshots. Reload catalog if another admin has edited the same record. Note assets remain in /public.</p>
  </>
}
function NoteEditor({ note, onSaved }: { note: AdminNote; onSaved: () => void }) {
  const [draft, setDraft] = useState(note)
  const [settings, setSettings] = useState<AdminPhase[]>(() => phases.map(phase => note.phases.find(item => item.phase === phase) ?? { phase, enabled: false, sort_order: 0, prediction_text: '' }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await saveAdminNote(draft, settings); onSaved() }
    catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  function change(phase: NoteLayer, patch: Partial<AdminPhase>) { setSettings(current => current.map(item => item.phase === phase ? { ...item, ...patch } : item)) }
  return <form className="admin-form" onSubmit={submit} aria-label={`Edit ${note.name}`}>
    <label className="admin-checkbox"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })}/>Active</label>
    <label>Category<input required maxLength={100} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}/></label>
    <label>Descriptor<textarea required maxLength={500} value={draft.descriptor} onChange={event => setDraft({ ...draft, descriptor: event.target.value })}/></label>
    <fieldset><legend>Allowed phases & display order</legend>{settings.map(item => <div className="admin-phase" key={item.phase}>
      <label className="admin-checkbox"><input type="checkbox" checked={item.enabled} disabled={note.id === 'soapy'} onChange={event => change(item.phase, { enabled: event.target.checked })}/>{item.phase === 'middle' ? 'Mid' : item.phase === 'top' ? 'Top' : 'Base'}</label>
      <label>{item.phase} display order<input type="number" min={0} max={9999} step={1} required value={item.sort_order} onChange={event => change(item.phase, { sort_order: Number(event.target.value) })}/></label>
      <label>{item.phase} prediction copy<textarea maxLength={500} value={item.prediction_text} onChange={event => change(item.phase, { prediction_text: event.target.value })}/></label>
    </div>)}</fieldset>
    {note.id === 'soapy' ? <p className="admin-help">Soapy supports all three phases; each Creation can use it only once.</p> : null}
    {note.sticker_asset ? <p className="admin-help">Asset: {note.sticker_asset}</p> : null}
    {error ? <p role="alert">{error}</p> : null}<button className="orders-build" disabled={busy}>{busy ? 'Saving…' : `Save ${note.name}`}</button>
  </form>
}
function ProductEditor({ product, onSaved }: { product: AdminProduct; onSaved: () => void }) {
  const [active, setActive] = useState(product.active)
  const [regular, setRegular] = useState(String(product.regular_price))
  const [sale, setSale] = useState(product.sale_price === null ? '' : String(product.sale_price))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await saveAdminProduct({ ...product, active, regular_price: Number(regular), sale_price: sale.trim() === '' ? null : Number(sale) })
      onSaved()
    } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <article className="admin-editor"><h2>{product.label}</h2><form className="admin-form" aria-label={`Edit ${product.label}`} onSubmit={submit}>
    <label className="admin-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/>Active</label>
    <label>Regular price (IDR)<input type="number" required min={1} max={2147483647} step={1} value={regular} onChange={event => setRegular(event.target.value)}/></label>
    <label>Launch / sale price (IDR)<input type="number" min={1} max={Number(regular) || 2147483647} step={1} value={sale} onChange={event => setSale(event.target.value)}/></label>
    {error ? <p role="alert">{error}</p> : null}<button className="orders-build" disabled={busy}>{busy ? 'Saving…' : `Save ${product.label}`}</button>
  </form></article>
}
