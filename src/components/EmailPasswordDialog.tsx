import { useState } from 'react'
import type { useAuth } from '../hooks/useAuth'

type Mode = 'sign-in' | 'sign-up' | 'forgot-password' | 'recovery' | 'verify-email'

function messageFor(error: unknown, action: 'sign-in' | 'sign-up' | 'send' | 'password') {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (!navigator.onLine || /network|fetch|failed to fetch|timeout/.test(message)) return 'Unable to connect. Check your internet connection and try again.'
  if (message.includes('email_already_registered')) return 'An account already uses this email. Sign in instead.'
  if (action === 'sign-in' && /invalid|credentials|password/.test(message)) return 'Email or password is incorrect.'
  if (action === 'password' && /password|weak|same/.test(message)) return 'Choose a stronger password and try again.'
  return action === 'send' ? 'We could not send that email right now. Please try again shortly.' : 'We could not complete that request. Please try again.'
}

export function EmailPasswordDialog({ auth, open, onClose, onAuthenticated }: { auth: ReturnType<typeof useAuth>; open: boolean; onClose: () => void; onAuthenticated: () => void }) {
  const [recoverySession, setRecoverySession] = useState(false)
  if (auth.passwordRecovery && !recoverySession) setRecoverySession(true)

  const recoveryMode = auth.passwordRecovery || recoverySession
  if (!open && !recoveryMode) return null
  return <EmailPasswordDialogContents key={recoveryMode ? 'recovery' : 'sign-in'} auth={auth} onClose={() => { setRecoverySession(false); onClose() }} onAuthenticated={() => { setRecoverySession(false); onAuthenticated() }}/>
}

function EmailPasswordDialogContents({ auth, onClose, onAuthenticated }: { auth: ReturnType<typeof useAuth>; onClose: () => void; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode>(() => auth.passwordRecovery ? 'recovery' : 'sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function changeMode(next: Mode) {
    setMode(next)
    setPassword('')
    setConfirmPassword('')
    setMessage('')
  }

  function validPassword() {
    if (password.length < 8) { setMessage('Password must be at least 8 characters.'); return false }
    if ((mode === 'sign-up' || mode === 'recovery') && password !== confirmPassword) { setMessage('Passwords do not match.'); return false }
    return true
  }

  async function submit() {
    if (busy) return
    setMessage('')
    if (mode === 'sign-in') {
      if (!email.trim() || !password) return
      setBusy(true)
      try { await auth.signInWithPassword(email, password); onAuthenticated() }
      catch (error) { setMessage(messageFor(error, 'sign-in')) }
      finally { setBusy(false) }
      return
    }
    if (mode === 'sign-up') {
      if (!email.trim() || !validPassword()) return
      setBusy(true)
      try {
        const result = await auth.signUp(email, password)
        if (result.requiresVerification) changeMode('verify-email')
        else onAuthenticated()
      } catch (error) { setMessage(messageFor(error, 'sign-up')) }
      finally { setBusy(false) }
      return
    }
    if (mode === 'forgot-password') {
      if (!email.trim()) return
      setBusy(true)
      try { await auth.resetPasswordForEmail(email); setMessage('If an account uses this email, a password reset link has been sent.') }
      catch (error) { setMessage(messageFor(error, 'send')) }
      finally { setBusy(false) }
      return
    }
    if (mode === 'recovery') {
      if (!validPassword()) return
      setBusy(true)
      try { await auth.updatePassword(password); setMessage('Your password has been updated. You can now continue.'); setTimeout(onAuthenticated, 800) }
      catch (error) { setMessage(messageFor(error, 'password')) }
      finally { setBusy(false) }
      return
    }
    setBusy(true)
    try { await auth.resendVerificationEmail(email); setMessage('Verification email sent. Check your inbox, then sign in.') }
    catch (error) { setMessage(messageFor(error, 'send')) }
    finally { setBusy(false) }
  }

  const isPasswordMode = mode === 'sign-in' || mode === 'sign-up' || mode === 'recovery'
  const title = mode === 'sign-in' ? 'Welcome back.' : mode === 'sign-up' ? 'Create your account.' : mode === 'forgot-password' ? 'Reset your password.' : mode === 'recovery' ? 'Choose a new password.' : 'Check your email.'
  return <div className="auth-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="email-auth-title">
      <button className="auth-dialog-close" type="button" aria-label="Close sign in" disabled={busy} onClick={onClose}>x</button>
      <span>PERFUN LAB</span><h2 id="email-auth-title">{title}</h2>
      {mode === 'verify-email' ? <p>Check your email to verify your account. Once verified, return here and sign in.</p> : null}
      {mode !== 'recovery' && mode !== 'verify-email' ? <><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder="you@example.com" /></> : null}
      {isPasswordMode ? <><label htmlFor="auth-password">{mode === 'recovery' ? 'New password' : 'Password'}</label><input id="auth-password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submit() }} disabled={busy} />{(mode === 'sign-up' || mode === 'recovery') ? <><label htmlFor="auth-confirm-password">Confirm password</label><input id="auth-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submit() }} disabled={busy} /></> : null}</> : null}
      <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'PLEASE WAIT...' : mode === 'sign-in' ? 'SIGN IN' : mode === 'sign-up' ? 'CREATE ACCOUNT' : mode === 'forgot-password' ? 'SEND RESET LINK' : mode === 'recovery' ? 'SAVE NEW PASSWORD' : 'RESEND VERIFICATION EMAIL'}</button>
      <div className="auth-dialog-actions">{mode === 'sign-in' ? <><button type="button" className="auth-dialog-link" onClick={() => changeMode('forgot-password')} disabled={busy}>Forgot password?</button><button type="button" className="auth-dialog-link" onClick={() => changeMode('sign-up')} disabled={busy}>Create account</button></> : null}{mode === 'sign-up' || mode === 'forgot-password' || mode === 'verify-email' ? <button type="button" className="auth-dialog-link" onClick={() => changeMode('sign-in')} disabled={busy}>Sign in</button> : null}</div>
      {message ? <p className="auth-dialog-message" role="status">{message}</p> : null}
    </section>
  </div>
}
