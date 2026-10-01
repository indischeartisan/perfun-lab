import type { CartItem } from '../types'
import type { OrderIntent } from './orders'
import { isPlaySet } from './cart'

export function prepareBagCheckout(items: CartItem[]): OrderIntent[] {
  if (!items.length) throw new Error('Your bag is empty.')
  return items.map(item => ({
    product_id: isPlaySet(item) ? 'bundle-3x10ml' : `${item.size}ml`,
    quantity: item.quantity,
    formulas: (isPlaySet(item) ? item.blends : [item.notes]).map(formula => ({
      top: formula.top.id, middle: formula.middle.id, base: formula.base.id,
    })),
  }))
}
