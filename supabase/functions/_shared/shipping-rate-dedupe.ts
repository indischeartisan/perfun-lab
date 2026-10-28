import type { Rate } from './rajaongkir.ts'

// Edge Function isolates do not share memory. This deduplicates only identical
// concurrent provider requests handled by the same warm isolate; the database
// rate cache remains the cross-instance cache and source of reusable rates.
const pendingRates = new Map<string, Promise<Rate[]>>()

export function dedupeShippingRateRequest(key: string, load: () => Promise<Rate[]>) {
  const existing = pendingRates.get(key)
  if (existing) return existing
  const pending = Promise.resolve().then(load).finally(() => pendingRates.delete(key))
  pendingRates.set(key, pending)
  return pending
}
