import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { errorMessage, requireSupabase, supabase } from '../lib/supabase'
import { errorWithCause } from '../lib/errors'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('error_description') ?? '')
  const [profile, setProfile] = useState<{ userId: string; role: 'customer' | 'perfumer' | 'admin' | 'vendor' | null } | null>(null)
  const userId = session?.user.id
  useEffect(() => {
    if (!userId || !supabase) return
    let active = true
    const refresh = async () => {
      try {
        const { data, error } = await requireSupabase().from('profiles').select('role').eq('id', userId).single()
        if (error) throw error
        if (active) setProfile({ userId, role: data.role })
      } catch (error) { if (active) { setProfile({ userId, role: null }); setError(errorMessage(error)) } }
    }
    const onFocus = () => { void refresh() }
    void refresh()
    window.addEventListener('focus', onFocus)
    return () => { active = false; window.removeEventListener('focus', onFocus) }
  }, [userId])
  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (active) { setSession(next); if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true); setLoading(false) }
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(data.session); setLoading(false)
      if (error) setError(error.message)
    }).catch(error => { if (active) { setError(errorMessage(error)); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!session?.user.id) return
    window.dispatchEvent(new CustomEvent('perfun-authenticated', { detail: session.user.id }))
  }, [session?.user.id])
  async function login() {
    setError('')
    try {
      const { error } = await requireSupabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } })
      if (error) throw error
    } catch (error) { setError(errorMessage(error)) }
  }
  async function logout() {
    setError('')
    try {
      const { error } = await requireSupabase().auth.signOut()
      if (error) throw error
      setSession(null)
    } catch (error) { setError(errorMessage(error)) }
  }
  async function signInWithPassword(email: string, password: string) {
    setError('')
    try {
      const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw error
    } catch (error) {
      const message = errorMessage(error)
      throw errorWithCause(message, error)
    }
  }
  async function signUp(email: string, password: string) {
    setError('')
    try {
      const { data, error } = await requireSupabase().auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
      if (error) throw error
      if (data.user?.identities?.length === 0) throw new Error('EMAIL_ALREADY_REGISTERED')
      return { requiresVerification: !data.session }
    } catch (error) {
      const message = errorMessage(error)
      throw errorWithCause(message, error)
    }
  }
  async function resetPasswordForEmail(email: string) {
    setError('')
    try {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin + window.location.pathname })
      if (error) throw error
    } catch (error) {
      throw errorWithCause(errorMessage(error), error)
    }
  }
  async function resendVerificationEmail(email: string) {
    setError('')
    try {
      const { error } = await requireSupabase().auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.origin + window.location.pathname } })
      if (error) throw error
    } catch (error) {
      throw errorWithCause(errorMessage(error), error)
    }
  }
  async function updatePassword(password: string) {
    setError('')
    try {
      const { error } = await requireSupabase().auth.updateUser({ password })
      if (error) throw error
      setPasswordRecovery(false)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch (error) {
      throw errorWithCause(errorMessage(error), error)
    }
  }
  return { user: session?.user ?? null, role: profile?.userId === userId ? profile?.role : null, roleLoading: Boolean(userId && profile?.userId !== userId), loading, passwordRecovery, error, login, signInWithPassword, signUp, resetPasswordForEmail, resendVerificationEmail, updatePassword, logout }
}
