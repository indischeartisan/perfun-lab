import type { OrderIntent } from './orders'

/** Stable identity for checkout work; callers should not key effects by array identity. */
export function orderIntentFingerprint(items: OrderIntent[]): string {
  return JSON.stringify(items.map(item => ({
    product_id: item.product_id,
    quantity: item.quantity,
    formulas: item.formulas.map(formula => ({ top: formula.top, middle: formula.middle, base: formula.base })),
  })))
}
