import { UserRound } from 'lucide-react'
import type { useAuth } from '../hooks/useAuth'

export function AccountMenu({ auth, onLogin }: { auth: ReturnType<typeof useAuth>; onLogin: () => void }) {
  return <details className="header-account" key={auth.user?.id ?? 'guest'}><summary aria-label="Account"><UserRound size={22}/></summary><div className="header-account-panel">
    {auth.loading ? <p role="status">Loading account…</p> : auth.user ? <><strong>Google account</strong><p>{auth.user.email}</p><button onClick={auth.logout}>Sign out</button></> : <button onClick={auth.login}>Continue with Google</button>}
    {!auth.loading && !auth.user ? <button className="email-login-button" onClick={onLogin}>Sign in or create account</button> : null}
    {auth.user ? <strong className="email-account-label">Signed in</strong> : null}
  </div></details>
}
