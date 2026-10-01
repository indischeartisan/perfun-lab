import { useEffect, useState } from 'react'
import { errorMessage } from '../lib/supabase'

export function useAdminData<T>(load: () => Promise<T>, poll = false) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true, fetching = false
    async function refresh() {
      if (fetching) return
      fetching = true
      try { const result = await load(); if (active) { setData(result); setError('') } }
      catch (error) { if (active) { setData(null); setError(errorMessage(error)) } }
      finally { fetching = false }
    }
    void refresh()
    const timer = poll ? window.setInterval(() => { if (!document.hidden) void refresh() }, 30000) : null
    return () => { active = false; if (timer !== null) clearInterval(timer) }
  }, [load, poll, revision])
  return { data, error, reload: () => setRevision(n => n + 1) }
}
