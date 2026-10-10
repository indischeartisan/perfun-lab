import type { Catalog } from './catalog'
import type { OrderIntent } from './orders'
import { readPendingCheckout } from './storageValidation'

export const bagCheckoutResumeKey = 'perfun-return-to-bag'
export const directCheckoutResumeKey = 'perfun-direct-checkout-v1'

export function readSessionValue(key: string) {
  try { return sessionStorage.getItem(key) } catch { return null }
}

export function writeSessionValue(key: string, value: string) {
  try { sessionStorage.setItem(key, value) } catch { /* Session resume is optional. */ }
}

export function removeSessionValue(key: string) {
  try { sessionStorage.removeItem(key) } catch { /* Session resume is optional. */ }
}

export function readPendingDirectCheckout(noteGroups: Catalog['noteGroups']): OrderIntent[] | null {
  try {
    const value = readSessionValue(directCheckoutResumeKey)
    if (!value) return null
    const items = readPendingCheckout(value, noteGroups)
    if (items) return items
    removeSessionValue(directCheckoutResumeKey)
    return null
  } catch {
    removeSessionValue(directCheckoutResumeKey)
    return null
  }
}
