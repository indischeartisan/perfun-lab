import type { CartItem, CompleteSelection, ProductChoice } from '../types'
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

export function prepareDirectFormulaCheckout(product: ProductChoice, formula: CompleteSelection, playSetBlends: CompleteSelection[]): OrderIntent[] {
  const formulas = product === 'play-set' ? playSetBlends : [formula]
  if (product === 'play-set' && formulas.length !== 3) throw new Error('Finish three mixes before checking out your Play Set.')
  return [{
    product_id: product === 'play-set' ? 'bundle-3x10ml' : `${product}ml`,
    quantity: 1,
    formulas: formulas.map(item => ({ top: item.top.id, middle: item.middle.id, base: item.base.id })),
  }]
}
