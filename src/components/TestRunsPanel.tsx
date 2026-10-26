import { useCallback, useEffect, useRef, useState } from 'react'
import { getAdminCatalog, getAdminVendorWorkspace, type AdminCatalog, type AdminVendor } from '../lib/admin'
import { advanceTestRun, createTestRun, listTestRuns, testModeStatus, type TestAction, type TestAddress, type TestRun, type TestRunStatus } from '../lib/testRuns'
import { errorMessage } from '../lib/supabase'
import { useAdminData } from '../hooks/useAdminData'
import type { FormulaSnapshot } from './WorkspacePresentation'
import { OperationsBottleSize, OperationsFormulaRow, OperationsOrderCard, OperationsOrderHeader } from './OperationsPresentation'

const phases = ['top', 'middle', 'base'] as const
const emptyFormula = (): FormulaSnapshot => ({ top: '', middle: '', base: '' })
const stageLabels: Record<TestRunStatus, string> = { order: 'Order', production: 'Produksi', packing: 'Packing', shipping: 'Kirim', done: 'Selesai', cancelled: 'Dibatalkan' }
type Stage = 'order' | 'production' | 'shipping' | 'done'
const emptyAddress = (): TestAddress => ({ recipient: '', phone: '', province: '', city: '', district: '', postal_code: '', address: '', detail: '' })
const addressFields: { key: keyof TestAddress; label: string }[] = [
  { key: 'recipient', label: 'Nama penerima fiktif' }, { key: 'phone', label: 'Nomor telepon fiktif' },
  { key: 'province', label: 'Provinsi' }, { key: 'city', label: 'Kota / kabupaten' },
  { key: 'district', label: 'Kecamatan' }, { key: 'postal_code', label: 'Kode pos' },
  { key: 'address', label: 'Alamat lengkap fiktif' }, { key: 'detail', label: 'Detail tambahan (opsional)' },
]
function formatTestAddress(address: TestAddress | null | undefined) {
  return address ? [`TEST — ${address.recipient}`, address.phone, address.address, address.detail, `${address.district}, ${address.city}, ${address.province} ${address.postal_code}`].filter(Boolean).join('\n') : 'Alamat TEST belum tersedia'
}

function printTestDocument(run: TestRun) {
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Izinkan pop-up untuk mencetak dokumen TEST.')
  const doc = popup.document
  doc.title = 'TEST — NOT FOR SHIPPING'
  const style = doc.createElement('style')
  style.textContent = '@page{size:A6 portrait;margin:8mm}body{font:11pt sans-serif;color:#111}h1{border:3px solid #111;padding:5mm;font-size:18pt}p{overflow-wrap:anywhere;white-space:pre-line}'
  doc.head.append(style)
  const heading = doc.createElement('h1')
  heading.textContent = 'TEST — NOT FOR SHIPPING'
  doc.body.append(heading)
  const lines = [`TEST ${run.id}`, `TEST ${run.customer_name}`, formatTestAddress(run.test_address), `TEST ${run.bottle_count} × ${run.volume_ml} ml · Qty ${run.quantity}`,
    ...run.formulas.map((formula, index) => `TEST Botol ${index + 1}: Top ${formula.top}, Middle ${formula.middle}, Base ${formula.base}`),
    run.shipping ? `TEST ${run.shipping.courier} / ${run.shipping.service} · ${run.shipping.tracking}` : 'TEST — tidak ada pengiriman nyata']
  for (const line of lines) { const paragraph = doc.createElement('p'); paragraph.textContent = line; doc.body.append(paragraph) }
  popup.focus()
  popup.print()
}

export function TestRunsPanel({ role, stage }: { role: 'admin' | 'vendor'; stage?: Stage }) {
  const load = useCallback(async () => {
    try {
      const isEnabled = await testModeStatus()
      return { enabled: isEnabled, runs: isEnabled ? await listTestRuns() : [] }
    } catch (caught) {
      // The existing workspace remains usable before this migration is installed.
      const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : ''
      if (code === 'PGRST202') return { enabled: false, runs: [] }
      throw caught
    }
  }, [])
  const { data, error, reload } = useAdminData(load, true)
  const refresh = useCallback(async () => { reload() }, [reload])
  if (!data?.enabled) return error ? <p role="alert">TEST mode: {error}</p> : null
  const runs = data.runs
  const visible = role === 'vendor' && stage ? runs.filter(run => stage === 'shipping' ? run.status === 'packing' || run.status === 'shipping' : run.status === stage) : runs
  return <section className="test-runs-panel" aria-label="TEST orders">
    <h2>TEST — internal only</h2><p>Simulasi backend terpisah. Tidak ada pembayaran, payout, atau pengiriman nyata.</p>
    <button type="button" onClick={reload}>Refresh TEST</button>
    {error ? <p role="alert">{error}</p> : null}
    {role === 'admin' ? <TestCreate onCreated={refresh}/> : null}
    {!visible.length ? <p>Belum ada pesanan TEST pada tahap ini.</p> : null}
    <div className="production-list">{visible.map(run => <TestCard key={run.id} run={run} role={role} refresh={refresh}/>)}</div>
  </section>
}

function TestCreate({ onCreated }: { onCreated: () => Promise<void> }) {
  const [vendors, setVendors] = useState<AdminVendor[]>([])
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null)
  const [vendor, setVendor] = useState('')
  const [customer, setCustomer] = useState('')
  const [address, setAddress] = useState<TestAddress>(emptyAddress)
  const [size, setSize] = useState('10')
  const [quantity, setQuantity] = useState(1)
  const [formulas, setFormulas] = useState<FormulaSnapshot[]>([emptyFormula()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const request = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    void Promise.all([getAdminVendorWorkspace(0), getAdminCatalog()]).then(([workspace, result]) => {
      if (active) { setVendors(workspace.vendors); setCatalog(result) }
    }).catch(caught => { if (active) setError(errorMessage(caught)) })
    return () => { active = false }
  }, [])
  const changeSize = (value: string) => { setSize(value); setFormulas(Array.from({ length: value === 'play' ? 3 : 1 }, () => emptyFormula())) }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    request.current ??= crypto.randomUUID()
    try {
      await createTestRun(request.current, vendor, customer, size === '30' ? 30 : 10, size === 'play' ? 3 : 1, quantity, formulas, address)
      request.current = null; setCustomer(''); setAddress(emptyAddress()); await onCreated()
    } catch (caught) { setError(errorMessage(caught)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <details><summary>Buat pesanan TEST</summary><form className="admin-filters" onSubmit={event => { void submit(event) }}>
    <p>Gunakan nama fiktif. TEST tidak membuat order atau pembayaran nyata.</p>
    <label>Nama fiktif<input required maxLength={80} value={customer} onChange={event => setCustomer(event.target.value)}/></label>
    <fieldset><legend>Alamat pengiriman TEST — gunakan data fiktif</legend>{addressFields.map(({ key, label }) => <label key={key}>{label}<input required={key !== 'detail'} maxLength={key === 'postal_code' ? 5 : 300} pattern={key === 'postal_code' ? '[0-9]{5}' : undefined} value={address[key]} onChange={event => setAddress(current => ({ ...current, [key]: event.target.value }))}/></label>)}</fieldset>
    <label><input type="checkbox" required/> Saya memastikan seluruh nama, nomor telepon, dan alamat TEST adalah fiktif.</label>
    <label>Vendor<select required value={vendor} onChange={event => setVendor(event.target.value)}><option value="">Pilih vendor</option>{vendors.map(item => <option key={item.id} value={item.id}>{item.name || item.email || item.id}</option>)}</select></label>
    <label>Ukuran<select value={size} onChange={event => changeSize(event.target.value)}><option value="10">10 ml</option><option value="30">30 ml</option><option value="play">Play Set 3 × 10 ml</option></select></label>
    <label>Kuantitas<input type="number" required min={1} max={99} value={quantity} onChange={event => setQuantity(Number(event.target.value))}/></label>
    {formulas.map((formula, index) => <fieldset key={index}><legend>TEST Botol {index + 1}</legend>{phases.map(phase => <label key={phase}>{phase}<select required value={formula[phase] ?? ''} onChange={event => setFormulas(current => current.map((item, i) => i === index ? { ...item, [phase]: event.target.value } : item))}><option value="">Pilih note</option>{catalog?.notes.filter(note => note.active && note.phases.some(item => item.phase === phase && item.enabled)).map(note => <option key={note.id} value={note.name}>{note.name}</option>)}</select></label>)}</fieldset>)}
    {error ? <p role="alert">{error}</p> : null}<button type="submit" disabled={busy || !catalog || !vendor}>{busy ? 'Menyimpan…' : 'Buat TEST'}</button>
  </form></details>
}

function TestCard({ run, role, refresh }: { run: TestRun; role: 'admin' | 'vendor'; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [courier, setCourier] = useState('')
  const [service, setService] = useState('')
  const [tracking, setTracking] = useState('')
  const [cost, setCost] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const lock = useRef(false)
  const requests = useRef<Partial<Record<TestAction, string>>>({})
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopyFeedback(`${label} TEST berhasil disalin.`) }
    catch { setCopyFeedback(`Gagal menyalin ${label} TEST. Periksa izin clipboard.`) }
  }
  async function act(action: TestAction) {
    if (lock.current) return
    if (action === 'cancel' && !window.confirm('Batalkan pesanan TEST ini?')) return
    if (action === 'pack' && !window.confirm('TEST: Saya telah memeriksa seluruh packing. Tidak ada barang nyata yang dikirim.')) return
    if (action === 'ship' && (!courier.trim() || !service.trim() || !tracking.trim() || !/^[0-9]{1,12}$/.test(cost))) { setError('Isi kurir, layanan, resi TEST, dan biaya TEST yang valid.'); return }
    if (action === 'ship' && !window.confirm('TEST: Tandai selesai tanpa membuat pengiriman nyata?')) return
    const payload = action === 'pack' ? { confirmed: true } : action === 'ship' ? { courier: courier.trim(), service: service.trim(), tracking: tracking.trim(), cost: Number(cost) } : {}
    lock.current = true; setBusy(true); setError('')
    requests.current[action] ??= crypto.randomUUID()
    try { await advanceTestRun(run.id, requests.current[action]!, action, payload); delete requests.current[action]; await refresh() }
    catch (caught) { setError(errorMessage(caught)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <OperationsOrderCard>
    <OperationsOrderHeader orderNumber={`TEST · ${run.id.slice(0, 8)}`} status={`TEST · ${stageLabels[run.status]}`} time={new Date(run.created_at).toLocaleString()}/>
    <p><strong>TEST · {run.customer_name}</strong></p><OperationsBottleSize volumeMl={run.volume_ml} bottleCount={run.bottle_count}/><p>Kuantitas TEST: {run.quantity}</p>
    {run.formulas.map((formula, index) => <OperationsFormulaRow key={index} formula={formula} label={`TEST Botol ${index + 1}`}/>)}
    {role === 'vendor' ? <section className="test-address"><h3>Alamat pengiriman TEST</h3><p className="test-address-text">{formatTestAddress(run.test_address)}</p><div className="test-copy-actions"><button type="button" disabled={!run.test_address} onClick={() => { void copy(formatTestAddress(run.test_address), 'Alamat') }}>Copy Address</button><button type="button" onClick={() => { void copy(`TEST — NOT FOR SHIPPING\nTEST ${run.id}\n${formatTestAddress(run.test_address)}\nTEST ${run.bottle_count} × ${run.volume_ml} ml · Qty ${run.quantity}`, 'Order') }}>Copy Order</button></div><p role="status">{copyFeedback}</p></section> : null}
    {run.shipping ? <p>TEST · {run.shipping.courier} / {run.shipping.service} · {run.shipping.tracking} · Rp {run.shipping.cost}</p> : null}
    {role === 'vendor' && run.status === 'shipping' ? <div className="test-shipping-form"><label>Kurir TEST<input value={courier} onChange={event => setCourier(event.target.value)} maxLength={100}/></label><label>Layanan TEST<input value={service} onChange={event => setService(event.target.value)} maxLength={100}/></label><label>Resi TEST<input value={tracking} onChange={event => setTracking(event.target.value)} maxLength={100}/></label><label>Biaya TEST<input type="number" min={0} max={999999999999} value={cost} onChange={event => setCost(event.target.value)}/></label></div> : null}
    {error ? <p role="alert">{error}</p> : null}
    <button type="button" onClick={() => { try { printTestDocument(run) } catch (caught) { setError(errorMessage(caught)) } }}>Print A6 TEST</button>
    {role === 'admin' && run.status !== 'done' && run.status !== 'cancelled' ? <button type="button" disabled={busy} onClick={() => { void act('cancel') }}>Batalkan TEST</button> : null}
    {role === 'vendor' && run.status !== 'done' && run.status !== 'cancelled' ? <button type="button" className="orders-build" disabled={busy} onClick={() => { void act(run.status === 'order' ? 'start' : run.status === 'production' ? 'complete' : run.status === 'packing' ? 'pack' : 'ship') }}>{busy ? 'Menyimpan TEST…' : run.status === 'order' ? 'TEST · Mulai Produksi' : run.status === 'production' ? 'TEST · Selesai Produksi' : run.status === 'packing' ? 'TEST · Konfirmasi Packing' : 'TEST · Tandai Dikirim'}</button> : null}
  </OperationsOrderCard>
}
