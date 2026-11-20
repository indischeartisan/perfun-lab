import { UserRound } from 'lucide-react'
import type { useAuth } from '../hooks/useAuth'

export function AccountMenu({ auth, onLogin, onAccount }: { auth: ReturnType<typeof useAuth>; onLogin: () => void; onAccount?: () => void }) {
  return <details className="header-account" key={auth.user?.id ?? 'guest'}><summary aria-label="Akun"><UserRound size={22}/></summary><div className="header-account-panel">
    {auth.loading ? <p role="status">Memuat akun…</p> : auth.user ? <><p className="account-email">{auth.user.email}</p><div className="header-account-actions">{onAccount ? <button className="account-open-button" type="button" onClick={onAccount}>Buka akun saya</button> : null}<button className="account-logout" type="button" onClick={auth.logout}>Keluar dari akun</button></div></> : <button onClick={auth.login}>Lanjutkan dengan Google</button>}
    {!auth.loading && !auth.user ? <button className="email-login-button" onClick={onLogin}>Masuk atau buat akun</button> : null}
  </div></details>
}
