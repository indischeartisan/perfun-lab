/*
import { useEffect, useState } from 'react'
import type { useAuth } from '../hooks/useAuth'

const RESEND_COOLDOWN_SECONDS = 60

function displayError(error: unknown, action: 'send' | 'verify') {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (!navigator.onLine || /network|fetch|failed to fetch|timeout/.test(message)) return 'Unable to connect. Check your internet connection and try again.'
  if (action === 'verify' && /token|otp|code|expired|invalid/.test(message)) return 'That code is invalid or has expired. Request a new code and try again.'
  return action === 'send' ? 'We could not send a code right now. Please try again shortly.' : 'We could not verify that code. Please try again.'
}

export function EmailOtpDialog({ auth, open, onClose, onAuthenticated }: { auth: ReturnType<typeof useAuth>; open: boolean; onClose: () => void; onAuthenticated: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState<'sending' | 'verifying' | null>(null)
  const [message, setMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (!cooldown) return
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    if (!open) return
    setCode('')
    setMessage('')
  }, [open])

  async function sendCode() {
    if (!email.trim() || busy) return
    setBusy('sending')
    setMessage('')
    try {
      await auth.sendEmailOtp(email)
      setStep('code')
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setMessage(`A 6-digit code was sent to ${email.trim()}.`)
    } catch (error) {
      setMessage(displayError(error, 'send'))
    } finally {
      setBusy(null)
    }
  }

  async function verifyCode() {
    if (code.length !== 6 || busy) return
    setBusy('verifying')
    setMessage('')
    try {
      await auth.verifyEmailOtp(email, code)
      onAuthenticated()
    } catch (error) {
      setMessage(displayError(error, 'verify'))
    } finally {
      setBusy(null)
    }
  }

  function changeEmail() {
    setStep('email')
    setCode('')
    setMessage('')
    setCooldown(0)
  }

  if (!open) return null
  return <div className="auth-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="email-auth-title">
      <button className="auth-dialog-close" type="button" aria-label="Close sign in" disabled={Boolean(busy)} onClick={onClose}>×</button>
      <span>PERFUN LAB</span>
      <h2 id="email-auth-title">{step === 'email' ? 'Continue with email.' : 'Check your inbox.'}</h2>
      {step === 'email' ? <>
        <p>Enter your email and we’ll send a one-time code.</p>
        <label htmlFor="email-otp-email">Email address</label>
        <input id="email-otp-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void sendCode() }} disabled={Boolean(busy)} placeholder="you@example.com" />
        <button type="button" disabled={!email.trim() || Boolean(busy)} onClick={() => void sendCode()}>{busy === 'sending' ? 'SENDING CODE…' : 'CONTINUE'}</button>
      </> : <>
        <p>Enter the 6-digit code sent to <strong>{email}</strong>.</p>
        <label htmlFor="email-otp-code">One-time code</label>
        <input id="email-otp-code" className="otp-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={event => { if (event.key === 'Enter') void verifyCode() }} disabled={Boolean(busy)} placeholder="000000" />
        <button type="button" disabled={code.length !== 6 || Boolean(busy)} onClick={() => void verifyCode()}>{busy === 'verifying' ? 'VERIFYING…' : 'VERIFY'}</button>
        <div className="auth-dialog-actions"><button type="button" className="auth-dialog-link" disabled={Boolean(busy) || cooldown > 0} onClick={() => void sendCode()}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button><button type="button" className="auth-dialog-link" disabled={Boolean(busy)} onClick={changeEmail}>Change email</button></div>
      </>}
      {message ? <p className="auth-dialog-message" role="status">{message}</p> : null}
    </section>
  </div>
}
*/

export { EmailPasswordDialog as EmailOtpDialog } from './EmailPasswordDialog'
