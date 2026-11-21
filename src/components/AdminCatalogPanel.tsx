import { useRef, useState, type FormEvent } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { getAdminCatalog, saveAdminNote, saveAdminProduct, type AdminNote, type AdminPhase, type AdminProduct } from '../lib/admin'
import { errorMessage } from '../lib/supabase'
import { formatPrice } from '../lib/currency'
import type { NoteLayer } from '../types'

const phases: NoteLayer[] = ['top', 'middle', 'base']
export function AdminCatalogPanel({ section }: { section: 'notes' | 'products' }) {
  const { data, error, reload } = useAdminData(getAdminCatalog)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  function saved() { setNotice('Katalog berhasil disimpan.'); reload() }
  return <><div className="production-toolbar"><p>{section === 'notes' ? 'Kelola ketersediaan note dan fase yang diizinkan.' : 'Kelola status, harga, dan stok fisik produk.'}</p><button onClick={reload}>Muat ulang</button></div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading catalog…</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {section === 'notes' ? <label className="admin-search">Find a note<input value={search} onChange={event => setSearch(event.target.value)}/></label> : null}
    <div className="production-list">{section === 'notes' ? data?.notes.filter(note => `${note.name} ${note.category}`.toLowerCase().includes(search.toLowerCase())).map(note => <details className="admin-editor" key={`${note.id}:${note.version}`}><summary>{note.name} · {note.active ? 'Active' : 'Inactive'} · {note.category}</summary><NoteEditor note={note} onSaved={saved}/></details>) : data?.products.map(product => <ProductEditor key={`${product.id}:${product.version}`} product={product} playSetCapacity={playSetCapacity(data.products)} onSaved={saved}/>)}</div>
    <p className="admin-help">Pesanan lama tetap memakai snapshot aslinya. Muat ulang jika Admin lain mengubah data yang sama.</p>
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
function playSetCapacity(products: AdminProduct[]) {
  const stock = products.find(product => product.id === '10ml')
  if (!stock?.stock_tracking_enabled || stock.stock_on_hand === null) return null
  return Math.floor(Math.max(0, stock.stock_on_hand - stock.stock_reserved - stock.stock_sold) / 3)
}
function ProductEditor({ product, playSetCapacity, onSaved }: { product: AdminProduct; playSetCapacity: number | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [active, setActive] = useState(product.active)
  const [regular, setRegular] = useState(String(product.regular_price))
  const [sale, setSale] = useState(product.sale_price === null ? '' : String(product.sale_price))
  const physical = product.id === '10ml' || product.id === '30ml'
  const [stockOnHand, setStockOnHand] = useState(product.stock_on_hand === null ? '' : String(product.stock_on_hand))
  const [stockTrackingEnabled, setStockTrackingEnabled] = useState(product.stock_tracking_enabled)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  function cancel() {
    setActive(product.active)
    setRegular(String(product.regular_price))
    setSale(product.sale_price === null ? '' : String(product.sale_price))
    setStockOnHand(product.stock_on_hand === null ? '' : String(product.stock_on_hand))
    setStockTrackingEnabled(product.stock_tracking_enabled)
    setError('')
    setEditing(false)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await saveAdminProduct({ ...product, active, regular_price: Number(regular), sale_price: sale.trim() === '' ? null : Number(sale) }, stockOnHand.trim() === '' ? null : Number(stockOnHand), physical && stockTrackingEnabled)
      setEditing(false); onSaved()
    } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  const availableStock = product.stock_tracking_enabled && product.stock_on_hand !== null ? Math.max(0, product.stock_on_hand - product.stock_reserved - product.stock_sold) : null
  const currentPrice = product.sale_price ?? product.regular_price
  return <article className="admin-editor admin-product-card"><header className="admin-product-summary-header"><div><span className="admin-kicker">Produk &amp; Harga</span><h2>{product.label}</h2></div><span className={`admin-product-status ${product.active ? 'active' : ''}`}>{product.active ? 'Aktif' : 'Nonaktif'}</span></header>{!editing ? <><dl className="admin-product-summary"><div><dt>Harga sekarang</dt><dd>{formatPrice(currentPrice)}</dd></div><div><dt>Harga normal</dt><dd>{formatPrice(product.regular_price)}</dd></div><div><dt>Sisa stok tersedia</dt><dd>{product.id === 'bundle-3x10ml' ? playSetCapacity === null ? 'Belum dibatasi' : `${playSetCapacity} set` : availableStock === null ? 'Belum dibatasi' : `${availableStock} botol`}</dd></div><div><dt>Pembatasan stok</dt><dd>{product.stock_tracking_enabled ? 'Aktif' : 'Belum aktif'}</dd></div></dl><p className="admin-product-stock-note">{product.id === 'bundle-3x10ml' ? 'Kapasitas otomatis dari stok 10 mL ÷ 3.' : `Tertahan ${product.stock_reserved} · Terjual ${product.stock_sold}`}</p><button type="button" className="orders-build admin-product-edit" onClick={() => setEditing(true)}>Edit</button></> : <form className="admin-form" aria-label={`Edit ${product.label}`} onSubmit={submit}><label className="admin-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/>Aktif</label><label>Harga normal (Rp)<input type="number" required min={1} max={2147483647} step={1} value={regular} onChange={event => setRegular(event.target.value)}/></label><label>Harga promo (Rp)<input type="number" min={1} max={Number(regular) || 2147483647} step={1} value={sale} onChange={event => setSale(event.target.value)}/></label>{physical ? <fieldset><legend>Stok fisik</legend><label>Stok botol 10 mL / 30 mL<input type="number" min={0} max={2147483647} step={1} value={stockOnHand} onChange={event => setStockOnHand(event.target.value)}/></label><label className="admin-checkbox"><input type="checkbox" checked={stockTrackingEnabled} onChange={event => setStockTrackingEnabled(event.target.checked)}/>Aktifkan pembatasan penjualan</label><p className="admin-help">Tersedia: {availableStock === null ? 'belum dibatasi' : `${availableStock} botol`} · Tertahan: {product.stock_reserved} · Terjual: {product.stock_sold}</p></fieldset> : <p className="admin-help">Kapasitas Play Set otomatis: {playSetCapacity === null ? 'belum dibatasi' : `${playSetCapacity} set`}. Play Set memakai 3 botol stok 10 mL.</p>}{error ? <p role="alert">{error}</p> : null}<div className="admin-form-actions"><button type="submit" className="orders-build" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button><button type="button" className="secondary-action" disabled={busy} onClick={cancel}>Batal</button></div></form>}</article>
}
