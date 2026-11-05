import { useEffect, useRef, useState, type FormEvent } from 'react'
import { deleteAddress, listAddresses, saveAddress, type Address, type AddressInput } from '../lib/orders'
import { saveAddressWithDestination, searchShippingDestinations, type ShippingDestination } from '../lib/shipping'
import { createShippingSearchRequestGate } from '../lib/shippingSearchState'
import { canSaveShippingAddress, hasVerifiedShippingDestination, shippingDestinationState, storedAddressRegionSummary } from '../lib/shippingAddressState'
import { errorMessage } from '../lib/supabase'

const empty: AddressInput = { recipient_name: '', phone: '', address_line: '', city: '', province: '', postal_code: '', label: '', is_default: false }
const fields: Array<{ key: Exclude<keyof AddressInput, 'is_default'>; label: string; autoComplete?: string }> = [
  { key: 'recipient_name', label: 'Nama penerima', autoComplete: 'name' }, { key: 'phone', label: 'Nomor telepon', autoComplete: 'tel' },
  { key: 'address_line', label: 'Jalan dan detail rumah', autoComplete: 'street-address' }, { key: 'city', label: 'Kabupaten / kota', autoComplete: 'address-level2' },
  { key: 'province', label: 'Provinsi', autoComplete: 'address-level1' }, { key: 'postal_code', label: 'Kode pos', autoComplete: 'postal-code' }, { key: 'label', label: 'Label alamat' },
]
type SelectedDestination = { destination: ShippingDestination; query: string }
type Editor = { id: string; value: AddressInput; original: Address | null; selected: SelectedDestination | null; needsLocation: boolean }

function locationField(label: unknown, key: string): string | null {
  if (!label || typeof label !== 'object' || Array.isArray(label)) return null
  const value = (label as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function LocationDetails({ label }: { label: unknown }) {
  const rows = ([['Provinsi', 'province'], ['Kabupaten / kota', 'city'], ['Kecamatan', 'district'], ['Kelurahan / desa', 'subdistrict'], ['Kode pos', 'postal_code']] as const)
    .map(([title, key]) => [title, locationField(label, key)] as const).filter(([, value]) => value)
  return <div className="shipping-location-details"><p>{locationField(label, 'name') ?? 'Lokasi tersimpan'}</p>{rows.length ? <dl>{rows.map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl> : null}</div>
}

function DestinationSearch({ onSelect }: { onSelect: (value: SelectedDestination) => void }) {
  const [search, setSearch] = useState('')
  const [destinations, setDestinations] = useState<ShippingDestination[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const gate = useRef(createShippingSearchRequestGate())
  useEffect(() => {
    const query = search.trim()
    const currentGate = gate.current
    const revision = currentGate.begin()
    if (query.length < 3) return
    let active = true
    const timer = window.setTimeout(() => {
      if (!currentGate.start(revision)) return
      setSearchBusy(true); setError('')
      searchShippingDestinations(query)
        .then(rows => { if (active && currentGate.isCurrent(revision)) setDestinations(rows) })
        .catch(cause => { if (active && currentGate.isCurrent(revision)) setError(errorMessage(cause)) })
        .finally(() => { if (active && currentGate.settle(revision)) setSearchBusy(false) })
    }, 350)
    return () => { active = false; window.clearTimeout(timer); currentGate.invalidate() }
  }, [search, retry])
  function updateSearch(value: string) {
    gate.current.invalidate(); setSearchBusy(false); setDestinations([]); setError(''); setSearch(value)
  }
  return <div className="shipping-search" aria-busy={searchBusy}>
    <label><span>Cari lokasi pengiriman</span><input value={search} onChange={event => updateSearch(event.target.value)} placeholder="Kecamatan, kota, atau kode pos" autoComplete="off"/></label>
    {searchBusy ? <p role="status">Mencari lokasi…</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Coba lagi</button></p> : null}
    {search.trim().length >= 3 && !searchBusy && !destinations.length && !error ? <p>Belum ada lokasi. Periksa kata pencarian.</p> : null}
    <div className="shipping-destinations">{destinations.map(destination => <button type="button" key={destination.id} onClick={() => { gate.current.invalidate(); onSelect({ destination, query: search.trim() }) }}><b>{destination.label.name}</b><small>{[destination.label.district, destination.label.city, destination.label.province, destination.label.postal_code].filter(Boolean).join(', ')}</small></button>)}</div>
  </div>
}

export function AddressBook({ selectedId, onSelect, onAddressSelect, destinationSearchEnabled = true }: { selectedId: string; onSelect: (id: string) => void; onAddressSelect?: (address: Address) => void; destinationSearchEnabled?: boolean }) {
  const [items, setItems] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    listAddresses().then(rows => { if (active) { setItems(rows); if (!selectedId) { const preferred = rows.find(row => row.is_default); if (preferred) { onSelect(preferred.id); onAddressSelect?.(preferred) } } } }).catch(cause => { if (active) setError(errorMessage(cause)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt, selectedId, onSelect, onAddressSelect])
  function edit(address: Address) {
    setEditor({ id: address.id, value: address, original: address, selected: null, needsLocation: destinationSearchEnabled && !hasVerifiedShippingDestination(address) })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editor || busy || !canSaveShippingAddress(destinationSearchEnabled, editor.original, !!editor.selected, editor.needsLocation)) return
    setBusy(true); setError('')
    if (selectedId === editor.id) onSelect(editor.id)
    try {
      if (destinationSearchEnabled && editor.selected) await saveAddressWithDestination(editor.id, editor.value, editor.selected.query, editor.selected.destination.id)
      else await saveAddress(editor.id, editor.value)
      const rows = await listAddresses(); setItems(rows)
      const saved = rows.find(row => row.id === editor.id)
      if (!saved) throw new Error('Alamat tersimpan tetapi tidak dapat dimuat ulang. Silakan coba lagi.')
      onSelect(saved.id); onAddressSelect?.(saved); setEditor(null)
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (!window.confirm('Hapus alamat ini?')) return
    setBusy(true); setError('')
    try { await deleteAddress(id); setItems(current => current.filter(row => row.id !== id)); if (selectedId === id) onSelect('') }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  return <div className="guest-form"><h2>Alamat pengiriman</h2>
    {loading ? <p role="status">Memuat alamat…</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => { setError(''); setLoading(true); setAttempt(n => n + 1) }}>Coba lagi</button></p> : null}
    <div className="address-list">{items.map(address => <article className={`address-card ${selectedId === address.id ? 'selected' : ''}`} key={address.id}>
      <label><input type="radio" name="address" checked={selectedId === address.id} onChange={() => { onSelect(address.id); onAddressSelect?.(address) }} disabled={busy}/><strong>{address.label}{address.is_default ? ' · Utama' : ''}</strong></label>
      <AddressText address={address}/><div className="address-status">{destinationSearchEnabled ? <small className={`address-status-${shippingDestinationState(address)}`}>{shippingDestinationState(address) === 'valid' ? 'Lokasi terverifikasi' : shippingDestinationState(address) === 'inconsistent' ? 'Lokasi perlu diperiksa' : 'Lokasi belum lengkap'}</small> : null}</div><div className="address-actions"><button type="button" disabled={busy} onClick={() => edit(address)}>{destinationSearchEnabled && shippingDestinationState(address) === 'inconsistent' ? 'Periksa lokasi pengiriman' : destinationSearchEnabled && !hasVerifiedShippingDestination(address) ? 'Lengkapi Lokasi Pengiriman' : 'Ubah'}</button><button type="button" disabled={busy} onClick={() => remove(address.id)}>Hapus</button></div>
    </article>)}</div>
    {!loading && !items.length ? <p>Tambahkan alamat pengiriman untuk melanjutkan.</p> : null}
    {!editor ? <button type="button" className="orders-build" disabled={busy} onClick={() => setEditor({ id: crypto.randomUUID(), value: { ...empty, is_default: items.length === 0 }, original: null, selected: null, needsLocation: destinationSearchEnabled })}>Tambah alamat</button> : <div className="address-editor-backdrop"><form onSubmit={submit} className="address-editor"><header><span>ALAMAT PENGIRIMAN</span><h3>{editor.original ? 'Ubah alamat' : 'Alamat baru'}</h3></header><div className="form-grid">{fields.filter(field => !destinationSearchEnabled || !['city', 'province', 'postal_code'].includes(field.key)).map(field => <label key={field.key} className={field.key === 'address_line' ? 'wide' : ''}><span>{field.label}</span><input required maxLength={field.key === 'address_line' ? 500 : 100} autoComplete={field.autoComplete} value={editor.value[field.key]} onChange={event => setEditor({ ...editor, value: { ...editor.value, [field.key]: event.target.value } })}/></label>)}</div>
      {destinationSearchEnabled ? <div><h4>Lokasi pengiriman</h4>{editor.needsLocation ? <><div className="shipping-location-review" role="note"><span>Wilayah tersimpan saat ini</span><p>{storedAddressRegionSummary(editor.value)}</p><small>Pilih lokasi resmi RajaOngkir untuk melanjutkan.</small></div><DestinationSearch onSelect={selected => setEditor(current => current ? { ...current, selected, needsLocation: false, value: { ...current.value, city: selected.destination.label.city ?? '', province: selected.destination.label.province ?? '', postal_code: selected.destination.label.postal_code ?? '' } } : current)}/></> : <><LocationDetails label={editor.selected?.destination.label ?? editor.original?.rajaongkir_destination_label}/><button type="button" disabled={busy} onClick={() => setEditor({ ...editor, selected: null, needsLocation: true })}>Ubah lokasi</button></>}</div> : null}
      <label className="default-address"><input type="checkbox" checked={editor.value.is_default} onChange={event => setEditor({ ...editor, value: { ...editor.value, is_default: event.target.checked } })}/> Jadikan alamat utama</label><div className="address-actions"><button type="submit" disabled={busy || !canSaveShippingAddress(destinationSearchEnabled, editor.original, !!editor.selected, editor.needsLocation)}>{busy ? 'Menyimpan…' : 'Simpan alamat'}</button><button type="button" disabled={busy} onClick={() => setEditor(null)}>Batal</button></div></form></div>}
  </div>
}

export function AddressText({ address }: { address: AddressInput }) {
  const label = 'rajaongkir_destination_label' in address ? address.rajaongkir_destination_label : null
  const village = locationField(label, 'subdistrict'), district = locationField(label, 'district')
  const storedDistrict = 'district' in address && typeof address.district === 'string' ? address.district : ''
  // Never display the provider's district as if it were already saved when a
  // legacy address requires the customer's explicit location confirmation.
  const locality = shippingDestinationState(address) === 'inconsistent' ? storedDistrict : [village, district].filter((value, index, all) => value && all.indexOf(value) === index).join(', ') || storedDistrict
  return <div className="address-text"><strong>{address.recipient_name}</strong><p>{address.phone}</p><p>{address.address_line}</p>{locality ? <p>{locality}</p> : null}<p>{address.city}, {address.province} {address.postal_code}</p></div>
}
