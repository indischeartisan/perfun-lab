import { useEffect, useState, type FormEvent } from 'react'
import { deleteAddress, listAddresses, saveAddress, type Address, type AddressInput } from '../lib/orders'
import { errorMessage } from '../lib/supabase'

const empty: AddressInput = { recipient_name: '', phone: '', address_line: '', city: '', province: '', postal_code: '', label: '', is_default: false }
const fields: Array<{ key: Exclude<keyof AddressInput, 'is_default'>; label: string; autoComplete?: string }> = [
  { key: 'recipient_name', label: 'Recipient name', autoComplete: 'name' }, { key: 'phone', label: 'Phone', autoComplete: 'tel' },
  { key: 'address_line', label: 'Address', autoComplete: 'street-address' }, { key: 'city', label: 'City / Regency', autoComplete: 'address-level2' },
  { key: 'province', label: 'Province', autoComplete: 'address-level1' }, { key: 'postal_code', label: 'Postal code', autoComplete: 'postal-code' }, { key: 'label', label: 'Label (Home, Office…)' },
]

export function AddressBook({ selectedId, onSelect, onAddressSelect }: { selectedId: string; onSelect: (id: string) => void; onAddressSelect?: (address: Address) => void }) {
  const [items, setItems] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<{ id: string; value: AddressInput } | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    listAddresses().then(rows => { if (active) { setItems(rows); if (!selectedId) { const preferred = rows.find(row => row.is_default); if (preferred) { onSelect(preferred.id); onAddressSelect?.(preferred) } } } }).catch(error => { if (active) setError(errorMessage(error)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt, selectedId, onSelect])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editor || busy) return
    setBusy(true); setError('')
    try {
      await saveAddress(editor.id, editor.value)
      const rows = await listAddresses(); setItems(rows); onSelect(editor.id); onAddressSelect?.(rows.find(row => row.id === editor.id) ?? { ...editor.value, id: editor.id, user_id: '' }); setEditor(null)
    } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this saved address?')) return
    setBusy(true); setError('')
    try { await deleteAddress(id); setItems(current => current.filter(row => row.id !== id)); if (selectedId === id) onSelect('') }
    catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  return <div className="guest-form"><h2>Delivery address</h2>
    {loading ? <p role="status">Loading addresses…</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => { setError(''); setLoading(true); setAttempt(n => n + 1) }}>Retry</button></p> : null}
    <div className="address-list">{items.map(address => <article className={`address-card ${selectedId === address.id ? 'selected' : ''}`} key={address.id}>
      <label><input type="radio" name="address" checked={selectedId === address.id} onChange={() => { onSelect(address.id); onAddressSelect?.(address) }} disabled={busy}/><strong>{address.label}{address.is_default ? ' · Default' : ''}</strong></label>
      <AddressText address={address}/><div className="address-actions"><button disabled={busy} onClick={() => setEditor({ id: address.id, value: address })}>Edit</button><button disabled={busy} onClick={() => remove(address.id)}>Delete</button></div>
    </article>)}</div>
    {!loading && !items.length ? <p>Add a delivery address to continue.</p> : null}
    {!editor ? <button className="orders-build" disabled={busy} onClick={() => setEditor({ id: crypto.randomUUID(), value: { ...empty, is_default: items.length === 0 } })}>ADD ADDRESS</button> : <form onSubmit={submit} className="address-editor"><h3>{items.some(row => row.id === editor.id) ? 'Edit address' : 'New address'}</h3><div className="form-grid">{fields.map(field => <label key={field.key} className={field.key === 'address_line' ? 'wide' : ''}><span>{field.label}</span><input required maxLength={field.key === 'address_line' ? 500 : 100} autoComplete={field.autoComplete} value={editor.value[field.key]} onChange={event => setEditor({ ...editor, value: { ...editor.value, [field.key]: event.target.value } })}/></label>)}</div><label className="default-address"><input type="checkbox" checked={editor.value.is_default} onChange={event => setEditor({ ...editor, value: { ...editor.value, is_default: event.target.checked } })}/> Set as default address</label><div className="address-actions"><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button><button type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button></div></form>}
  </div>
}

export function AddressText({ address }: { address: AddressInput }) {
  return <div className="address-text"><strong>{address.recipient_name}</strong><p>{address.phone}</p><p>{address.address_line}</p><p>{address.city}, {address.province} {address.postal_code}</p></div>
}
