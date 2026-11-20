import { ChevronRight, Package, ShoppingBag, UserRound } from 'lucide-react'
import { useRef } from 'react'
import type { useAuth } from '../hooks/useAuth'

export function AccountMenu({ auth, onLogin, onAccount, onOrders, onBag }: { auth: ReturnType<typeof useAuth>; onLogin: () => void; onAccount?: () => void; onOrders?: () => void; onBag?: () => void }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const select = (action: () => void) => { action(); if (menu.current) menu.current.open = false }
  const customerNavigation = onAccount && onOrders && onBag
  return <details ref={menu} className="header-account" key={auth.user?.id ?? 'guest'}><summary aria-label="Akun"><UserRound size={22}/></summary><div className="header-account-panel">
    {auth.loading ? <p role="status">Memuat akun…</p> : auth.user ? <><p className="account-email">{auth.user.email}</p>{customerNavigation ? <nav className="account-nav" aria-label="Navigasi akun"><button className="account-nav-row" type="button" onClick={() => select(onAccount)}><UserRound aria-hidden="true"/><span>Akun saya</span><ChevronRight aria-hidden="true"/></button><button className="account-nav-row" type="button" onClick={() => select(onOrders)}><Package aria-hidden="true"/><span>Pesanan saya</span><ChevronRight aria-hidden="true"/></button><button className="account-nav-row" type="button" onClick={() => select(onBag)}><ShoppingBag aria-hidden="true"/><span>Bag</span><ChevronRight aria-hidden="true"/></button></nav> : null}<div className="account-actions"><button className="account-logout" type="button" onClick={() => { if (menu.current) menu.current.open = false; void auth.logout() }}>Keluar dari akun</button></div></> : <button onClick={auth.login}>Lanjutkan dengan Google</button>}
    {!auth.loading && !auth.user ? <button className="email-login-button" onClick={onLogin}>Masuk atau buat akun</button> : null}
  </div></details>
}
