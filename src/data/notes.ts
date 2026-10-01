import type { NoteLayer, Selection } from '../types'

export const emptySelection: Selection = { top: null, middle: null, base: null }

export const layerCopy: Record<NoteLayer, { step: string; title: string; hint: string }> = {
  top: { step: '01', title: 'Make an entrance', hint: 'The first impression. Bright and quick to bloom.' },
  middle: { step: '02', title: 'Show your heart', hint: 'The main character. This shapes the scent’s personality.' },
  base: { step: '03', title: 'Leave a trace', hint: 'The lasting memory. Deep, warm and close to skin.' }
}
