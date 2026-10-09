import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

interface LocalStorageOptions<T> {
  restore?: (value: unknown) => T | null
  migrateFromKeys?: string[]
}

function removeStoredValue(key: string | null) {
  if (!key) return
  try { localStorage.removeItem(key) } catch { /* Storage is optional for the app. */ }
}

function readStoredValue<T>(key: string | null, initialValue: T, options: LocalStorageOptions<T>) {
  if (!key) return initialValue
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    const restored = options.restore ? options.restore(parsed) : parsed as T
    if (restored === null) { removeStoredValue(key); return null }
    return restored
  } catch {
    removeStoredValue(key)
    return null
  }
}

export function loadValue<T>(key: string | null, initialValue: T, options: LocalStorageOptions<T>) {
  const stored = readStoredValue(key, initialValue, options)
  if (stored !== null) return stored
  if (!key) return initialValue
  for (const legacyKey of options.migrateFromKeys ?? []) {
    const legacy = readStoredValue(legacyKey, initialValue, options)
    if (legacy === null) continue
    try { localStorage.setItem(key, JSON.stringify(legacy)); localStorage.removeItem(legacyKey) } catch { /* Keep the readable source draft if transfer cannot persist. */ }
    return legacy
  }
  return initialValue
}

export function useLocalStorage<T>(key: string | null, initialValue: T, options: LocalStorageOptions<T> = {}) {
  const [stored, setStored] = useState(() => ({ key, value: loadValue(key, initialValue, options) }))

  if (stored.key !== key) {
    setStored({ key, value: loadValue(key, initialValue, options) })
  }

  useEffect(() => {
    if (!key || stored.key !== key) return
    try {
      localStorage.setItem(key, JSON.stringify(stored.value))
    } catch { /* Continue without draft persistence. */ }
  }, [key, stored])

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => setStored(current => {
    if (current.key !== key) return current
    return { ...current, value: typeof next === 'function' ? (next as (previous: T) => T)(current.value) : next }
  }), [key])
  return [stored.key === key ? stored.value : initialValue, setValue] as const
}
