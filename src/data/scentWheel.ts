import type { NoteLayer } from '../types'
import type { Catalog } from '../lib/catalog'

export const scentFamilies = ['citrus', 'aquatic-clean', 'green', 'fruity', 'floral', 'gourmand', 'amber', 'woody', 'aromatic', 'spicy'] as const
export type ScentFamily = typeof scentFamilies[number]
export type WheelPreset = 'family' | 'harmonious' | 'bold' | 'surprise'
export type WheelExplorerPreset = WheelPreset | 'custom'

export const scentFamilyMetadata: Readonly<Record<ScentFamily, { label: string; description: string; color: string }>> = {
  citrus: { label: 'Citrus', description: 'Cerah, zesty, dan membangkitkan energi.', color: '#f4ce72' },
  'aquatic-clean': { label: 'Aquatic & Clean', description: 'Airy, bersih, dan terasa lapang.', color: '#b9dfe2' },
  green: { label: 'Green', description: 'Daun segar, hijau, dan hidup.', color: '#c8df9b' },
  fruity: { label: 'Fruity', description: 'Juicy, ceria, dan penuh rasa ingin tahu.', color: '#f5ada7' },
  floral: { label: 'Floral', description: 'Kelopak lembut, mekar, dan ekspresif.', color: '#efb7c1' },
  gourmand: { label: 'Gourmand', description: 'Nikmat, creamy, dan menghangatkan.', color: '#ebcd9c' },
  amber: { label: 'Amber', description: 'Resinous, hangat, dan berpendar.', color: '#e4b172' },
  woody: { label: 'Woody', description: 'Halus, kayu, dan membumi.', color: '#d5b489' },
  aromatic: { label: 'Aromatic', description: 'Herbal, sejuk, dan transparan.', color: '#a9d5b0' },
  spicy: { label: 'Spicy', description: 'Bersemangat, peppery, dan berkilau.', color: '#e7a491' },
}

export const scentFamilyLabels: Record<ScentFamily, string> = Object.fromEntries(scentFamilies.map(family => [family, scentFamilyMetadata[family].label])) as Record<ScentFamily, string>
export const scentFamilyDescriptions: Record<ScentFamily, string> = Object.fromEntries(scentFamilies.map(family => [family, scentFamilyMetadata[family].description])) as Record<ScentFamily, string>

export const noteFamilyMetadata: Readonly<Record<string, { primary: ScentFamily; secondary?: ScentFamily }>> = {
  yuzu: { primary: 'citrus' }, 'sea-breeze': { primary: 'aquatic-clean' }, soapy: { primary: 'aquatic-clean' }, 'clean-musk': { primary: 'aquatic-clean' }, 'green-leaves': { primary: 'green' }, matcha: { primary: 'green' }, berries: { primary: 'fruity' }, peony: { primary: 'floral' }, jasmine: { primary: 'floral', secondary: 'amber' }, coffee: { primary: 'gourmand', secondary: 'amber' }, vanilla: { primary: 'gourmand', secondary: 'amber' }, 'coconut-milk': { primary: 'gourmand' }, honey: { primary: 'gourmand', secondary: 'amber' }, amber: { primary: 'amber' }, sandalwood: { primary: 'woody', secondary: 'amber' }, mint: { primary: 'aromatic' }, tea: { primary: 'aromatic', secondary: 'green' }, 'pink-pepper': { primary: 'spicy', secondary: 'aromatic' }
}

const adjacentFamilies: Record<ScentFamily, ScentFamily[]> = {
  citrus: ['aquatic-clean', 'green', 'fruity'], 'aquatic-clean': ['citrus', 'green', 'floral'], green: ['citrus', 'aromatic', 'woody'], fruity: ['citrus', 'floral', 'gourmand'], floral: ['fruity', 'gourmand', 'amber'], gourmand: ['amber', 'fruity', 'floral'], amber: ['gourmand', 'woody', 'spicy'], woody: ['amber', 'aromatic', 'green'], aromatic: ['green', 'citrus', 'woody'], spicy: ['amber', 'woody', 'aromatic']
}
const contrastingFamilies: Record<ScentFamily, ScentFamily[]> = {
  citrus: ['amber', 'woody'], 'aquatic-clean': ['gourmand', 'spicy'], green: ['gourmand', 'amber'], fruity: ['woody', 'aromatic'], floral: ['green', 'woody'], gourmand: ['aquatic-clean', 'green'], amber: ['citrus', 'aquatic-clean'], woody: ['fruity', 'floral'], aromatic: ['gourmand', 'fruity'], spicy: ['aquatic-clean', 'floral']
}

export function activeWheelNotes(catalog: Catalog) {
  return Array.from(new Map(Object.values(catalog.noteGroups).flat().map(note => [note.id, note])).values()).filter(note => noteFamilyMetadata[note.id])
}

export function unmappedWheelNoteIds(catalog: Catalog): string[] {
  return Array.from(new Map(Object.values(catalog.noteGroups).flat().map(note => [note.id, note])).keys()).filter(id => !noteFamilyMetadata[id])
}

export function wheelNoteLayers(catalog: Catalog, id: string): NoteLayer[] {
  return (['top', 'middle', 'base'] as NoteLayer[]).filter(layer => catalog.noteGroups[layer].some(note => note.id === id))
}

export const wheelLayers = ['top', 'middle', 'base'] as const satisfies readonly NoteLayer[]
export type WheelLayerSelection = Record<NoteLayer, string | null>
export interface WheelExplorationState {
  activeFamilyIds: ScentFamily[]
  activePreset: WheelExplorerPreset
  focusedFamilyId: ScentFamily | null
}

export function emptyWheelExplorationState(): WheelExplorationState {
  return { activeFamilyIds: [], activePreset: 'custom', focusedFamilyId: null }
}

export function emptyWheelLayerSelection(): WheelLayerSelection {
  return { top: null, middle: null, base: null }
}

/**
 * Returns the active-catalog notes for one formula layer and the selected Wheel families.
 * A Map keeps an accidental duplicate catalog row from rendering twice in a layer.
 */
export function wheelNotesForLayer(catalog: Catalog, families: readonly ScentFamily[], layer: NoteLayer) {
  const visible = catalog.noteGroups[layer].filter(note => {
    const metadata = noteFamilyMetadata[note.id]
    return Boolean(metadata && families.includes(metadata.primary))
  })
  return Array.from(new Map(visible.map(note => [note.id, note])).values())
}

export function selectedWheelNoteIds(selection: WheelLayerSelection): string[] {
  return wheelLayers.flatMap(layer => selection[layer] ? [selection[layer]] : [])
}

/** One unique note per formula layer; an occupied slot never replaces itself implicitly. */
export function toggleWheelLayerSelection(selection: WheelLayerSelection, layer: NoteLayer, id: string): WheelLayerSelection {
  if (selection[layer] === id) return { ...selection, [layer]: null }
  if (selection[layer] || selectedWheelNoteIds(selection).includes(id)) return selection
  return { ...selection, [layer]: id }
}

export function isWheelLayerNoteDisabled(selection: WheelLayerSelection, layer: NoteLayer, id: string): boolean {
  if (selection[layer] === id) return false
  return Boolean(selection[layer]) || selectedWheelNoteIds(selection).includes(id)
}

export function familiesForPreset(family: ScentFamily, preset: Exclude<WheelPreset, 'surprise'>): ScentFamily[] {
  if (preset === 'family') return [family]
  return [family, ...(preset === 'harmonious' ? adjacentFamilies[family] : contrastingFamilies[family])]
}

export function surpriseFamilies(catalog: Catalog, random = Math.random): ScentFamily[] {
  const active = scentFamilies.filter(family => activeWheelNotes(catalog).some(note => noteFamilyMetadata[note.id]?.primary === family))
  if (!active.length) return []
  const remaining = [...active]
  const picked: ScentFamily[] = []
  while (remaining.length && picked.length < 3) picked.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0])
  return picked
}

/** Compatibility helper for the original Phase 3A view; new UI uses surpriseFamilies. */
export function surpriseFamily(catalog: Catalog, seed: number): ScentFamily {
  const families = surpriseFamilies(catalog, () => Math.abs(seed % 997) / 997)
  return families[0]
}

export function toggleWheelFamily(current: ScentFamily[], family: ScentFamily): ScentFamily[] {
  if (current.includes(family)) return current.filter(item => item !== family)
  return [...current, family]
}

export function resetWheelExploration() {
  return { familyIds: [] as ScentFamily[], selectedIds: [] as string[] }
}

export function toggleWheelSelection(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter(value => value !== id)
  return current.length < 3 ? [...current, id] : current
}
