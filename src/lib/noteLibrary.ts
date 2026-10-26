import type { Catalog } from './catalog'
import type { FragranceNote, NoteLayer } from '../types'

export type LibraryNote = { note: FragranceNote; layers: NoteLayer[] }

export function getLibraryNotes(catalog: Catalog): LibraryNote[] {
  const byId = new Map<string, LibraryNote>()
  for (const layer of ['top', 'middle', 'base'] as NoteLayer[]) for (const note of catalog.noteGroups[layer]) {
    const found = byId.get(note.id)
    if (found) found.layers.push(layer)
    else byId.set(note.id, { note, layers: [layer] })
  }
  return [...byId.values()]
}
