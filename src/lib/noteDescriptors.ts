import type { FragranceNote } from '../types'

const NOTE_DESCRIPTORS: Readonly<Record<string, string>> = {
  yuzu: 'Bright',
  berries: 'Juicy',
  'pink-pepper': 'Sparkling',
  mint: 'Cool',
  'green-leaves': 'Crisp',
  'sea-breeze': 'Airy',
  soapy: 'Clean',
  peony: 'Soft',
  matcha: 'Calm',
  tea: 'Aromatic',
  coffee: 'Roasty',
  jasmine: 'Luminous',
  'clean-musk': 'Soft',
  vanilla: 'Creamy',
  sandalwood: 'Smooth',
  amber: 'Warm',
  'coconut-milk': 'Milky',
  honey: 'Golden',
}

export function getNoteDescriptor(note: Pick<FragranceNote, 'id' | 'category'>): string {
  return NOTE_DESCRIPTORS[note.id] ?? note.category
}
