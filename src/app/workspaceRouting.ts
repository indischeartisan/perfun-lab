import type { AppView } from '../types'

const hashViews = new Set<AppView>(['explore', 'wheel', 'fresh', 'study', 'library', 'note', 'article', 'build', 'more', 'bag', 'checkout', 'orders', 'production', 'fulfillment', 'payouts', 'admin'])
const vendorViews = new Set<AppView>(['production', 'fulfillment', 'payouts'])
const customerViews = new Set<AppView>(['explore', 'wheel', 'fresh', 'study', 'library', 'note', 'article', 'build', 'bag', 'checkout', 'confirmation', 'orders', 'more'])

export type ArticleOrigin = 'explore' | 'fresh' | 'study'

export function articleIdFromHash(hash: string): string | null {
  const value = hash.replace(/^#/, '')
  if (!value.startsWith('article/')) return null
  try {
    const id = decodeURIComponent(value.slice('article/'.length).split('?')[0])
    return id || null
  } catch {
    return null
  }
}

export function articleOriginFromHash(hash: string): ArticleOrigin | null {
  const value = hash.replace(/^#/, '')
  if (!value.startsWith('article/')) return null
  const query = value.split('?')[1]
  const origin = query ? new URLSearchParams(query).get('from') : null
  return origin === 'explore' || origin === 'fresh' || origin === 'study' ? origin : null
}

export function articleHash(id: string, origin?: ArticleOrigin): string {
  return `#article/${encodeURIComponent(id)}${origin ? `?from=${origin}` : ''}`
}

export function noteIdFromHash(hash: string): string | null {
  const value = hash.replace(/^#/, '')
  if (!value.startsWith('note/')) return null
  try {
    const id = decodeURIComponent(value.slice('note/'.length))
    return id || null
  } catch {
    return null
  }
}

export function noteHash(id: string): string {
  return `#note/${encodeURIComponent(id)}`
}

export function viewFromHash(hash: string, hasCheckoutResume: boolean): AppView {
  const value = hash.replace(/^#/, '')
  if (!value && hasCheckoutResume) return 'bag'
  if (articleIdFromHash(hash)) return 'article'
  if (noteIdFromHash(hash)) return 'note'
  return hashViews.has(value as AppView) ? value as AppView : 'explore'
}

export function workspaceView(role: 'customer' | 'perfumer' | 'admin' | 'vendor' | null, requested: AppView): AppView {
  if (role === 'admin') return 'admin'
  if (role === 'vendor') return vendorViews.has(requested) ? requested : 'production'
  if (role === 'perfumer') return 'production'
  return customerViews.has(requested) ? requested : 'explore'
}

export function navigationHash(view: AppView, pathname: string, search: string): string {
  return hashViews.has(view) ? `#${view}` : `${pathname}${search}`
}
