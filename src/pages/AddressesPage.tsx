import { ArrowLeft } from 'lucide-react'
import { AddressBook } from '../components/AddressBook'

export function AddressesPage({ onBack }: { onBack: () => void }) {
  return <section className="app-screen addresses-screen"><button type="button" className="checkout-back" onClick={onBack}><ArrowLeft/> Kembali ke akun</button><header className="screen-title"><span>AKUN SAYA</span><h1>Alamat tersimpan</h1><p>Gunakan lokasi resmi agar pengiriman siap saat layanan dibuka.</p></header><AddressBook selectedId="" onSelect={() => {}} destinationSearchEnabled mode="manage"/></section>
}
