import type { AppView } from '../types'

const hashViews = new Set<AppView>(['bag', 'checkout', 'orders', 'production', 'fulfillment', 'payouts', 'admin'])
const vendorViews = new Set<AppView>(['production', 'fulfillment', 'payouts'])

export function viewFromHash(hash: string, hasCheckoutResume: boolean): AppView {
  const value = hash.replace(/^#/, '')
  if (!value && hasCheckoutResume) return 'bag'
  return hashViews.has(value as AppView) ? value as AppView : 'build'
}

export function workspaceView(role: 'customer' | 'perfumer' | 'admin' | 'vendor' | null, requested: AppView): AppView {
  return role === 'vendor' && !vendorViews.has(requested) ? 'production' : requested
}

export function navigationHash(view: AppView, pathname: string, search: string): string {
  return hashViews.has(view) ? `#${view}` : `${pathname}${search}`
}
