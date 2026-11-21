export const VENDOR_CACHE_TTL_MS = 30_000

interface CacheEntry<T> { value: T; fetchedAt: number }

const cache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

function cacheKey(accountId: string, scope: string) {
  return `${accountId}::${scope}`
}

export function getVendorCached<T>(accountId: string, scope: string, load: () => Promise<T>, options: { force?: boolean; ttlMs?: number } = {}) {
  const key = cacheKey(accountId, scope)
  const cached = cache.get(key) as CacheEntry<T> | undefined
  const ttlMs = options.ttlMs ?? VENDOR_CACHE_TTL_MS
  if (!options.force && cached && Date.now() - cached.fetchedAt < ttlMs) return Promise.resolve(cached.value)
  const running = inFlight.get(key) as Promise<T> | undefined
  if (running) return running
  const request = load().then(value => {
    cache.set(key, { value, fetchedAt: Date.now() })
    return value
  }).finally(() => { inFlight.delete(key) })
  inFlight.set(key, request)
  return request
}

export function clearVendorCache(accountId: string, scopePrefix?: string) {
  const prefix = `${accountId}::`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix) && (!scopePrefix || key.startsWith(`${prefix}${scopePrefix}`))) cache.delete(key)
  }
}

export function clearAllVendorCache() {
  cache.clear()
}
