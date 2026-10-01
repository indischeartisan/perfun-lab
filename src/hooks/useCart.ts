import { useEffect } from 'react'
import type { Catalog } from '../lib/catalog'
import { cartIdentity, isPlaySet, playSetIdentity, sameBlendAndSize } from '../lib/cart'
import type { BottleSize, CartItem, CompleteSelection } from '../types'
import { useLocalStorage } from './useLocalStorage'

export function useCart(catalog: Catalog) {
  const [items, setItems] = useLocalStorage<CartItem[]>('perfun-bag-v2', [])
  const available = (id: number | string) => catalog.productOptions.some(option => option.id === id)
  const visibleItems = items.filter(item => available(isPlaySet(item) ? 'play-set' : item.size))
  const count = visibleItems.reduce((sum, item) => sum + item.quantity, 0)

  useEffect(() => {
    setItems(current => {
      let changed = false
      const migrated = current.map(item => {
        if (!catalog.productOptions.some(option => option.id === (isPlaySet(item) ? 'play-set' : item.size))) return item
        const currentPrice = isPlaySet(item) ? catalog.price('play-set') : catalog.price(item.size)
        if (item.price === currentPrice) return item
        changed = true
        return { ...item, price: currentPrice }
      })
      return changed ? migrated : current
    })
  }, [setItems, catalog])

  function add(notes: CompleteSelection, size: BottleSize) {
    if (!available(size)) return
    setItems(current => {
      const existing = current.find(item => !isPlaySet(item) && sameBlendAndSize(item, notes, size))
      if (existing) return current.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...current, { kind: 'single', id: cartIdentity(notes, size), notes: { ...notes }, size, quantity: 1, price: catalog.price(size) }]
    })
  }

  function addPlaySet(blends: CompleteSelection[]) {
    if (!available('play-set')) return
    const id = playSetIdentity(blends)
    setItems(current => {
      const existing = current.find(item => item.id === id)
      if (existing) return current.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...current, { kind: 'play-set', id, blends: blends.map(blend => ({ ...blend })), quantity: 1, price: catalog.price('play-set') }]
    })
  }

  function setQuantity(id: string, quantity: number) {
    if (quantity < 1) return
    setItems(current => current.map(item => item.id === id ? { ...item, quantity } : item))
  }

  function setSize(id: string, nextSize: BottleSize) {
    if (!available(nextSize)) return
    setItems(current => {
      const target = current.find(item => item.id === id)
      if (!target || isPlaySet(target) || target.size === nextSize) return current
      const duplicate = current.find(item => item.id !== id && !isPlaySet(item) && sameBlendAndSize(item, target.notes, nextSize))
      if (duplicate) return current.filter(item => item.id !== id).map(item => item.id === duplicate.id ? { ...item, quantity: item.quantity + target.quantity } : item)
      return current.map(item => item.id === id ? { ...item, id: cartIdentity(target.notes, nextSize), size: nextSize, price: catalog.price(nextSize) } : item)
    })
  }

  return { items: visibleItems, count, add, addPlaySet, setQuantity, setSize, remove: (id: string) => setItems(current => current.filter(item => item.id !== id)), clear: () => setItems([]) }
}
