import { UserRound } from 'lucide-react'
import type { useAuth } from '../hooks/useAuth'

export function AccountMenu({ auth, onLogin, onAccount }: { auth: ReturnType<typeof useAuth>; onLogin: () => void; onAccount?: () => void }) {
  return <details className="header-account" key={auth.user?.id ?? 'guest'}><summary aria-label="Akun"><UserRound size={22}/></summary><div className="header-account-panel">
    {auth.loading ? <p role="status">Memuat akun…</p> : auth.user ? <><strong>Akun saya</strong><p>{auth.user.email}</p>{onAccount ? <button type="button" onClick={onAccount}>Buka akun saya</button> : null}<button type="button" onClick={auth.logout}>Keluar</button></> : <button onClick={auth.login}>Lanjutkan dengan Google</button>}
    {!auth.loading && !auth.user ? <button className="email-login-button" onClick={onLogin}>Masuk atau buat akun</button> : null}
    {auth.user ? <strong className="email-account-label">Sudah masuk</strong> : null}
  </div></details>
}
