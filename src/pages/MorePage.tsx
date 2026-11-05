import { BookOpen, ChevronRight, MapPin, Newspaper, Package, UserRound } from 'lucide-react'

export function MorePage({ onOrders, onFresh, onStudy, onLibrary, onAccount }: { onOrders: () => void; onFresh: () => void; onStudy: () => void; onLibrary: () => void; onAccount: () => void }) {
  const items = [
    { label: 'Akun saya', copy: 'Alamat, pesanan, dan keamanan akun.', icon: UserRound, action: onAccount },
    { label: 'Pesanan saya', copy: 'Lihat pesanan Anda.', icon: Package, action: onOrders },
    { label: 'Fresh From the Lab', copy: 'Cerita dan eksperimen kecil.', icon: Newspaper, action: onFresh },
    { label: 'Lab Study', copy: 'Pelajaran singkat dari Lab.', icon: BookOpen, action: onStudy },
    { label: 'Note Library', copy: 'Kenali bahan yang Anda pilih.', icon: MapPin, action: onLibrary },
  ]
  return <section className="app-screen"><header className="screen-title"><span>PERFUN LAB</span><h1>Lainnya</h1><p>Hal-hal penting, tetap sederhana.</p></header><div className="more-list">{items.map(({ label, copy, icon: Icon, action }) => <button type="button" key={label} onClick={action}><i><Icon/></i><span><strong>{label}</strong><small>{copy}</small></span><ChevronRight/></button>)}</div></section>
}
