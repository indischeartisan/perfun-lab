import type { CompleteSelection, FragranceNote, NoteLayer, Selection } from '../types'
import type { OrderIntent } from './orders'

const layers: NoteLayer[] = ['top', 'middle', 'base']
const productIds = new Set(['10ml', '30ml', 'bundle-3x10ml'])
const emptySelection: Selection = { top: null, middle: null, base: null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function noteId(value: unknown): string | null {
  return isRecord(value) && typeof value.id === 'string' ? value.id : null
}

function validNotes(notes: Array<FragranceNote | null>) {
  const ids = notes.filter((note): note is FragranceNote => Boolean(note)).map(note => note.id)
  return ids.length === new Set(ids).size && ids.filter(id => id === 'soapy').length <= 1
}

export function rehydrateSelection(value: unknown, noteGroups: Record<NoteLayer, FragranceNote[]>): Selection {
  if (!isRecord(value)) return { ...emptySelection }
  const selection: Selection = { ...emptySelection }
  for (const layer of layers) {
    const id = noteId(value[layer])
    selection[layer] = id ? noteGroups[layer].find(note => note.id === id) ?? null : null
  }
  const selected = layers.map(layer => selection[layer])
  if (!validNotes(selected)) return { ...emptySelection }
  return selection
}

export function rehydrateCompleteSelection(value: unknown, noteGroups: Record<NoteLayer, FragranceNote[]>): CompleteSelection | null {
  const selection = rehydrateSelection(value, noteGroups)
  return selection.top && selection.middle && selection.base ? { top: selection.top, middle: selection.middle, base: selection.base } : null
}

export function rehydratePlaySet(value: unknown, noteGroups: Record<NoteLayer, FragranceNote[]>): CompleteSelection[] | null {
  if (!Array.isArray(value)) return null
  const restored: CompleteSelection[] = []
  for (const item of value) {
    const mix = rehydrateCompleteSelection(item, noteGroups)
    if (mix && restored.length < 3) restored.push(mix)
  }
  return restored
}

export function isOrderIntents(value: unknown): value is OrderIntent[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 50 && value.every(item => {
    if (!isRecord(item)) return false
    const quantity = item.quantity
    if (!productIds.has(String(item.product_id)) || !Number.isInteger(quantity) || typeof quantity !== 'number' || quantity < 1 || quantity > 99 || !Array.isArray(item.formulas)) return false
    const expectedFormulaCount = item.product_id === 'bundle-3x10ml' ? 3 : 1
    return item.formulas.length === expectedFormulaCount && item.formulas.every(formula => {
      if (!isRecord(formula)) return false
      const ids = layers.map(layer => formula[layer])
      return ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === 3 && ids.filter(id => id === 'soapy').length <= 1
    })
  })
}

export function orderIntentsMatchCatalog(value: unknown, noteGroups: Record<NoteLayer, FragranceNote[]>) {
  return isOrderIntents(value) && value.every(item => item.formulas.every(formula => {
    const notes = layers.map(layer => noteGroups[layer].find(note => note.id === formula[layer]) ?? null)
    return notes.every((note): note is FragranceNote => note !== null) && validNotes(notes)
  }))
}

export function readPendingCheckout(value: string | null, noteGroups: Record<NoteLayer, FragranceNote[]>): OrderIntent[] | null {
  if (!value) return null
  try {
    const items = JSON.parse(value)
    return orderIntentsMatchCatalog(items, noteGroups) ? items : null
  } catch {
    return null
  }
}

export function isCheckoutDraft(value: unknown): value is { userId: string; items: OrderIntent[]; source?: 'bag' | 'direct' } {
  return isRecord(value) && typeof value.userId === 'string' && value.userId.length > 0 && (value.source === undefined || value.source === 'bag' || value.source === 'direct') && isOrderIntents(value.items)
}

export function isCheckoutPending(value: unknown): value is { addressId: string; items: OrderIntent[]; requestId: string; token: string } {
  return isRecord(value) && typeof value.addressId === 'string' && value.addressId.length > 0 && typeof value.requestId === 'string' && value.requestId.length > 0 && typeof value.token === 'string' && value.token.length > 0 && isOrderIntents(value.items)
}
