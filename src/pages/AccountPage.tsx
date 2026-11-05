import { ChevronRight, KeyRound, MapPin, Package, UserRound } from 'lucide-react'

export function AccountPage({ email, onAddresses, onOrders }: { email?: string; onAddresses: () => void; onOrders: () => void }) {
  return <section className="app-screen account-screen">
    <header className="screen-title"><span>AKUN SAYA</span><h1>Halo.</h1><p>{email ? `Masuk sebagai ${email}` : 'Masuk untuk menyimpan alamat dan melihat pesanan.'}</p></header>
    <div className="account-list">
      <section className="account-profile"><UserRound/><div><strong>Profil</strong><p>{email ?? 'Informasi akun Anda akan tampil setelah masuk.'}</p></div></section>
      <button type="button" onClick={onAddresses}><MapPin/><span><strong>Alamat tersimpan</strong><small>Atur alamat utama dan lokasi pengiriman.</small></span><ChevronRight/></button>
      <button type="button" onClick={onOrders}><Package/><span><strong>Pesanan saya</strong><small>Lihat status pembayaran dan pengiriman.</small></span><ChevronRight/></button>
      <section className="account-profile"><KeyRound/><div><strong>Keamanan akun</strong><p>Gunakan menu akun untuk keluar. Pengaturan kata sandi tersedia saat masuk dengan email.</p></div></section>
    </div>
  </section>
}
