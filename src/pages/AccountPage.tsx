import { ChevronRight, LogOut, MapPin, Package } from 'lucide-react'

export function AccountPage({ email, onAddresses, onOrders, onLogout }: { email?: string; onAddresses: () => void; onOrders: () => void; onLogout: () => void }) {
  return <section className="app-screen account-screen">
    <header className="screen-title"><span>AKUN SAYA</span><h1>Halo.</h1><p>{email ?? 'Masuk untuk menyimpan alamat dan melihat pesanan.'}</p></header>
    <div className="account-list">
      <button type="button" onClick={onOrders}><Package/><span><strong>Pesanan saya</strong><small>Lihat status pembayaran dan pengiriman.</small></span><ChevronRight/></button>
      <button type="button" onClick={onAddresses}><MapPin/><span><strong>Alamat tersimpan</strong><small>Atur alamat utama dan lokasi pengiriman.</small></span><ChevronRight/></button>
      <button type="button" className="account-logout" onClick={onLogout}><LogOut/><span>Keluar dari akun</span></button>
    </div>
  </section>
}
