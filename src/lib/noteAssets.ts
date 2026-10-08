import type { FragranceNote } from '../types'

const NOTE_STICKERS: Readonly<Record<string, string>> = {
  yuzu: '/stickers/yuzu.webp',
  berries: '/stickers/berries.webp',
  'pink-pepper': '/stickers/pink-pepper.webp',
  mint: '/stickers/mint.webp',
  'green-leaves': '/stickers/green-leaves.webp',
  'sea-breeze': '/stickers/sea-breeze.webp',
  soapy: '/stickers/soapy.webp',
  peony: '/stickers/peony.webp',
  matcha: '/stickers/matcha.webp',
  tea: '/stickers/black-tea.webp',
  coffee: '/stickers/coffee.webp',
  jasmine: '/stickers/jasmine.webp',
  'clean-musk': '/stickers/clean-musk.webp',
  vanilla: '/stickers/vanilla.webp',
  sandalwood: '/stickers/sandalwood.webp',
  amber: '/stickers/amber.webp',
  'coconut-milk': '/stickers/coconut-milk.webp',
  honey: '/stickers/honey.webp',
}

export function getNoteStickerAsset(note: Pick<FragranceNote, 'id'>): string | null {
  return NOTE_STICKERS[note.id] ?? null
}
