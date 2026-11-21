import { useEffect, useState } from 'react'
import { errorMessage } from '../lib/supabase'
import { getVendorCached } from '../lib/vendorCache'

export function useVendorData<T>(accountId: string, scope: string, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    getVendorCached(accountId, scope, load, { force: revision > 0 })
      .then(result => { if (active) { setData(result); setError('') } })
      .catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [accountId, scope, load, revision])
  return { data, error, reload: () => setRevision(value => value + 1) }
}
