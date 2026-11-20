import { ArrowLeft, ChevronRight, LogOut, MapPin, Package } from 'lucide-react'

export function AccountPage({ email, onBack, onAddresses, onOrders, onLogout }: { email?: string; onBack: () => void; onAddresses: () => void; onOrders: () => void; onLogout: () => void }) {
  return <section className="app-screen account-screen">
    <button type="button" className="checkout-back" onClick={onBack}><ArrowLeft/> Kembali</button>
    <header className="screen-title"><span>AKUN SAYA</span><h1>Halo.</h1><p>{email ?? 'Masuk untuk menyimpan alamat dan melihat pesanan.'}</p></header>
    <div className="account-list">
      <button type="button" onClick={onOrders}><Package/><span><strong>Pesanan saya</strong><small>Lihat status pembayaran dan pengiriman.</small></span><ChevronRight/></button>
      <button type="button" onClick={onAddresses}><MapPin/><span><strong>Alamat tersimpan</strong><small>Atur alamat utama dan lokasi pengiriman.</small></span><ChevronRight/></button>
      <button type="button" className="account-logout" onClick={onLogout}><LogOut/><span>Keluar dari akun</span></button>
    </div>
  </section>
}
