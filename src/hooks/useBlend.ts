import { useEffect, useState } from 'react'
import { emptySelection } from '../data/notes'
import type { CompleteSelection, FragranceNote, NoteLayer, ProductChoice, Selection } from '../types'
import { useLocalStorage } from './useLocalStorage'

export function useBlend(noteGroups: Record<NoteLayer, FragranceNote[]>) {
  const [selection, setSelection] = useLocalStorage<Selection>('perfun-builder-draft-v3', emptySelection)
  const [product, setProductState] = useState<ProductChoice | null>(null)
  const [playSetBlends, setPlaySetBlends] = useState<CompleteSelection[]>([])
  const [added, setAdded] = useState(false)

  useEffect(() => {
    const normalized = normalizeSelection(selection, noteGroups)
    if (normalized !== selection) setSelection(normalized)
  }, [selection, setSelection, noteGroups])

  function choose(layer: NoteLayer, note: FragranceNote) {
    if (note.layer !== layer) return
    if (note.id === 'soapy' && Object.entries(selection).some(([selectedLayer, selectedNote]) => selectedLayer !== layer && selectedNote?.id === 'soapy')) return
    setAdded(false)
    if (product !== 'play-set') setProductState(null)
    setSelection(current => ({ ...current, [layer]: note }))
  }

  function reset() {
    setSelection(emptySelection)
    setProductState(null)
    setPlaySetBlends([])
    setAdded(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setProduct(next: ProductChoice) {
    setProductState(next)
    setAdded(false)
    if (next !== 'play-set') setPlaySetBlends([])
  }

  function addPlaySetBlend(blend: CompleteSelection) {
    if (playSetBlends.length >= 3) return
    const next = [...playSetBlends, { ...blend }]
    setPlaySetBlends(next)
    if (next.length < 3) setSelection(emptySelection)
  }

  return { selection, product, playSetBlends, added, choose, reset, setProduct, addPlaySetBlend, markAdded: () => setAdded(true) }
}

const layers: NoteLayer[] = ['top', 'middle', 'base']

function normalizeSelection(selection: Selection, noteGroups: Record<NoteLayer, FragranceNote[]>): Selection {
  let changed = false
  let soapyLayer: NoteLayer | null = null
  const normalized = { ...selection }

  for (const layer of layers) {
    const stored = selection[layer]
    const current = stored ? noteGroups[layer].find(note => note.id === stored.id) ?? null : null
    if (current?.id === 'soapy') {
      if (soapyLayer) {
        normalized[layer] = null
        changed = true
        continue
      }
      soapyLayer = layer
    }
    if (current !== stored) {
      normalized[layer] = current
      changed = true
    }
  }

  return changed ? normalized : selection
}
