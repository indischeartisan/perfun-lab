import { useEffect, useState } from 'react'
import { emptySelection } from '../data/notes'
import type { CompleteSelection, FragranceNote, NoteLayer, ProductChoice, Selection } from '../types'
import { useLocalStorage } from './useLocalStorage'
import { rehydratePlaySet, rehydrateSelection } from '../lib/storageValidation'

export function useBlend(noteGroups: Record<NoteLayer, FragranceNote[]>, ownerId: string | null) {
  const scope = ownerId === null ? null : ownerId === 'guest' ? 'perfun:guest' : `perfun:user:${ownerId}`
  const guestScope = 'perfun:guest'
  const migrationKeys = ownerId === null ? [] : ownerId === 'guest' ? ['perfun-builder-draft-v3'] : [`${guestScope}:builder`]
  const playSetMigrationKeys = ownerId === null ? [] : ownerId === 'guest' ? ['perfun-play-set-draft-v1'] : [`${guestScope}:play-set`]
  const [selection, setSelection] = useLocalStorage<Selection>(scope ? `${scope}:builder` : null, emptySelection, { restore: value => rehydrateSelection(value, noteGroups), migrateFromKeys: migrationKeys })
  const [product, setProductState] = useState<ProductChoice | null>(null)
  const [playSetBlends, setPlaySetBlends] = useLocalStorage<CompleteSelection[]>(scope ? `${scope}:play-set` : null, [], { restore: value => rehydratePlaySet(value, noteGroups), migrateFromKeys: playSetMigrationKeys })
  const [editingPlaySetIndex, setEditingPlaySetIndex] = useState<number | null>(null)
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

  function clearCurrentFormula() {
    setSelection(emptySelection)
    if (product !== 'play-set') setProductState(null)
    setAdded(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function discardPlaySet() {
    setSelection(emptySelection)
    setProductState(null)
    setPlaySetBlends([])
    setEditingPlaySetIndex(null)
    setAdded(false)
  }

  function setProduct(next: ProductChoice) {
    setProductState(next)
    setAdded(false)
    if (next !== 'play-set') setEditingPlaySetIndex(null)
  }

  function savePlaySetBlend(blend: CompleteSelection) {
    if (editingPlaySetIndex !== null) {
      setPlaySetBlends(current => current.map((item, index) => index === editingPlaySetIndex ? { ...blend } : item))
      setEditingPlaySetIndex(null)
      setSelection(emptySelection)
      return
    }
    if (playSetBlends.length >= 3) return
    const next = [...playSetBlends, { ...blend }]
    setPlaySetBlends(next)
    setSelection(emptySelection)
  }

  function editPlaySetBlend(index: number) {
    const blend = playSetBlends[index]
    if (!blend) return
    setAdded(false)
    setProductState('play-set')
    setEditingPlaySetIndex(index)
    setSelection({ ...blend })
  }

  function cancelPlaySetEdit() {
    if (editingPlaySetIndex === null) return
    setSelection(emptySelection)
    setEditingPlaySetIndex(null)
  }

  function exitPlaySet() {
    setSelection(emptySelection)
    setProductState(null)
    setEditingPlaySetIndex(null)
    setAdded(false)
  }

  return { selection, product, playSetBlends, added, editingPlaySetIndex, choose, clearCurrentFormula, discardPlaySet, setProduct, savePlaySetBlend, editPlaySetBlend, cancelPlaySetEdit, exitPlaySet, markAdded: () => setAdded(true) }
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
