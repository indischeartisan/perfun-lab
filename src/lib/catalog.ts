import type { FragranceNote, NoteLayer, ProductChoice } from '../types'
import type { ProductOption } from '../data/products'
import { requireSupabase } from './supabase'

export interface Catalog {
  noteGroups: Record<NoteLayer, FragranceNote[]>
  productOptions: ProductOption[]
  price: (id: ProductChoice) => number
}

export async function loadCatalog(): Promise<Catalog> {
  const db = requireSupabase()
  const [notes, products] = await Promise.all([
    db.from('note_phases').select('phase,prediction_text,sort_order,notes(*)').eq('enabled', true).order('sort_order'),
    db.from('products').select('*,product_prices(*)').order('sort_order'),
  ])
  if (notes.error) throw notes.error
  if (products.error) throw products.error
  const noteGroups: Catalog['noteGroups'] = { top: [], middle: [], base: [] }
  for (const row of notes.data) {
    const note = Array.isArray(row.notes) ? row.notes[0] : row.notes
    if (!note || !note.active || !(row.phase in noteGroups)) continue
    const layer = row.phase as NoteLayer
    noteGroups[layer].push({ id: note.id, name: note.name, layer, category: note.category,
      shortDescription: note.short_description, predictionText: row.prediction_text,
      stickerColor: note.sticker_color, icon: note.icon, stickerAsset: note.sticker_asset ?? undefined, profile: note.profile })
  }
  const productOptions: ProductOption[] = products.data.filter(row => row.active).map(row => {
    const prices = row.product_prices as Array<{ kind: string; amount: number }>
    const normal = prices.find(price => price.kind === 'normal')?.amount
    const launch = prices.find(price => price.kind === 'launch')?.amount
    if (normal == null) throw new Error(`Missing price for ${row.id}`)
    const id = row.id === '10ml' ? 10 : row.id === '30ml' ? 30 : row.id === 'bundle-3x10ml' ? 'play-set' : null
    if (id === null) throw new Error(`Unsupported product: ${row.id}`)
    return { id, label: row.label, description: row.description, badge: row.badge ?? undefined, normalPrice: normal, openingPrice: launch ?? normal }
  })
  return { noteGroups, productOptions, price(id) {
    const product = productOptions.find(option => option.id === id)
    if (!product) throw new Error('Product unavailable')
    return product.openingPrice
  } }
}
