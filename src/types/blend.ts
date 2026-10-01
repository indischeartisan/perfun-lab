import type { FragranceNote, NoteLayer } from './note'
export type Selection = Record<NoteLayer, FragranceNote | null>
export type CompleteSelection = Record<NoteLayer, FragranceNote>
