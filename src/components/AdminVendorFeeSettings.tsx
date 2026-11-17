import { useState, type FormEvent } from 'react'
import { AdminLoad } from '../pages/AdminPage'
import { useAdminData } from '../hooks/useAdminData'
import { formatPrice } from '../lib/currency'
import { getAdminVendorFeeSettings, updateAdminVendorFeeSettings } from '../lib/vendorFees'
import { errorMessage } from '../lib/supabase'

export function AdminVendorFeeSettings() {
  const { data, error, reload } = useAdminData(getAdminVendorFeeSettings)
  return <section className="finance-section vendor-fee-settings" aria-label="Pengaturan tarif perfumer">
    <div className="admin-section-heading"><div><span className="admin-kicker">PENGATURAN ADMIN</span><h2>Atur tarif perfumer</h2><p>Tarif disimpan ke snapshot saat pesanan ditugaskan. Perubahan tidak mengubah penugasan atau pembayaran lama.</p></div></div>
    <AdminLoad error={error} loading={!data && !error} reload={reload}/>
    {data ? <VendorFeeForm initial10ml={data.service_10ml} initial30ml={data.service_30ml} onSaved={reload}/> : null}
  </section>
}

function VendorFeeForm({ initial10ml, initial30ml, onSaved }: { initial10ml: number; initial30ml: number; onSaved: () => void }) {
  const [service10ml, setService10ml] = useState(String(initial10ml))
  const [service30ml, setService30ml] = useState(String(initial30ml))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next10ml = Number(service10ml)
    const next30ml = Number(service30ml)
    if (!Number.isSafeInteger(next10ml) || !Number.isSafeInteger(next30ml) || next10ml <= 0 || next30ml <= 0) {
      setActionError('Masukkan tarif rupiah berupa bilangan bulat lebih dari nol.')
      return
    }
    setBusy(true); setMessage(''); setActionError('')
    try {
      await updateAdminVendorFeeSettings(next10ml, next30ml)
      setMessage('Tarif perfumer tersimpan. Penugasan lama tetap memakai snapshot tarifnya.')
      onSaved()
    } catch (saveError) { setActionError(errorMessage(saveError)) } finally { setBusy(false) }
  }

  return <>
    <form className="finance-rate-form" onSubmit={save}>
      <label>Jasa 10 ml<input aria-label="Jasa 10 ml" type="number" min="1" step="1000" value={service10ml} disabled={busy} onChange={event => setService10ml(event.target.value)}/></label>
      <label>Jasa 30 ml<input aria-label="Jasa 30 ml" type="number" min="1" step="1000" value={service30ml} disabled={busy} onChange={event => setService30ml(event.target.value)}/></label>
      <label>Jasa Play Set<input aria-label="Jasa Play Set" type="text" value={formatPrice(Number(service10ml || 0) * 3)} readOnly/></label>
      <button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan tarif'}</button>
    </form>
    {message ? <p className="admin-notice" role="status">{message}</p> : null}
    {actionError ? <p role="alert">{actionError}</p> : null}
  </>
}
