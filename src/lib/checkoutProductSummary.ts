import type { Catalog } from './catalog'
import type { OrderIntent } from './orders'

type ProductShape = { bottleCount: number; volumeMl: number; fallbackLabel: string }
const shapes: Record<OrderIntent['product_id'], ProductShape> = {
  '10ml': { bottleCount: 1, volumeMl: 10, fallbackLabel: 'Parfum 10 ml' },
  '30ml': { bottleCount: 1, volumeMl: 30, fallbackLabel: 'Parfum 30 ml' },
  'bundle-3x10ml': { bottleCount: 3, volumeMl: 10, fallbackLabel: 'Play Set 3 × 10 ml' },
}

function optionId(productId: OrderIntent['product_id']) { return productId === 'bundle-3x10ml' ? 'play-set' : Number(productId.slice(0, -2)) }

/** Product information from the loaded catalog, explicitly not a checkout price snapshot. */
export function checkoutProductSummaries(items: OrderIntent[], catalog: Catalog) {
  const names = new Map(Object.values(catalog.noteGroups).flat().map(note => [note.id, note.name]))
  return items.map(item => {
    const shape = shapes[item.product_id]
    const product = catalog.productOptions.find(option => option.id === optionId(item.product_id))
    const opening = product?.openingPrice
    const normal = product?.normalPrice
    return {
      productId: item.product_id,
      label: product?.label ?? shape.fallbackLabel,
      bottleCount: shape.bottleCount,
      volumeMl: shape.volumeMl,
      quantity: item.quantity,
      blends: item.formulas.map((formula, index) => ({
        label: item.formulas.length > 1 ? `Blend ${index + 1}` : 'Blend pilihanmu',
        notes: [
          { phase: 'Top', id: formula.top, name: names.get(formula.top) ?? formula.top },
          { phase: 'Middle', id: formula.middle, name: names.get(formula.middle) ?? formula.middle },
          { phase: 'Base', id: formula.base, name: names.get(formula.base) ?? formula.base },
        ],
      })),
      price: typeof normal === 'number' && typeof opening === 'number' && normal >= opening
        ? { normal, opening, discount: normal - opening }
        : null,
    }
  })
}
