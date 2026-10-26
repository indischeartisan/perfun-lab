import type { Catalog } from './catalog'
import type { NoteLayer, Selection } from '../types'

const layers: NoteLayer[] = ['top', 'middle', 'base']

export interface WheelTransfer {
  topNoteId: string | null
  middleNoteId: string | null
  baseNoteId: string | null
}

export interface WheelTransferIssue {
  layer: NoteLayer
  id: string
  reason: 'unavailable' | 'wrong-layer' | 'duplicate' | 'soapy-conflict'
}

export interface WheelTransferResolution {
  selection: Selection
  issues: WheelTransferIssue[]
  hasAvailableNotes: boolean
}

export function wheelTransferFromLayerIds(selection: Record<NoteLayer, string | null>): WheelTransfer {
  return { topNoteId: selection.top, middleNoteId: selection.middle, baseNoteId: selection.base }
}

/** Reconciles the temporary Wheel payload against the current, active catalog only. */
export function resolveWheelTransfer(payload: WheelTransfer, catalog: Pick<Catalog, 'noteGroups'>): WheelTransferResolution {
  const ids: Record<NoteLayer, string | null> = {
    top: payload.topNoteId,
    middle: payload.middleNoteId,
    base: payload.baseNoteId,
  }
  const requested = layers.flatMap(layer => ids[layer] ? [{ layer, id: ids[layer]! }] : [])
  const counts = new Map<string, number>()
  for (const { id } of requested) counts.set(id, (counts.get(id) ?? 0) + 1)
  const soapyCount = counts.get('soapy') ?? 0
  const candidates: Selection = { top: null, middle: null, base: null }
  const issues: WheelTransferIssue[] = []

  for (const { layer, id } of requested) {
    const note = catalog.noteGroups[layer].find(candidate => candidate.id === id)
    if (!note) {
      const existsInAnotherLayer = layers.some(otherLayer => otherLayer !== layer && catalog.noteGroups[otherLayer].some(candidate => candidate.id === id))
      issues.push({ layer, id, reason: existsInAnotherLayer ? 'wrong-layer' : 'unavailable' })
      continue
    }
    if (id === 'soapy' && soapyCount > 1) {
      issues.push({ layer, id, reason: 'soapy-conflict' })
      continue
    }
    if ((counts.get(id) ?? 0) > 1) {
      issues.push({ layer, id, reason: 'duplicate' })
      continue
    }
    candidates[layer] = note
  }

  // useBlend rehydrates this once more through the existing persistence validator before applying it.
  return { selection: candidates, issues, hasAvailableNotes: layers.some(layer => candidates[layer] !== null) }
}
