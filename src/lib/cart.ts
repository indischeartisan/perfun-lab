import type { BottleSize, CompleteSelection, PlaySetCartItem, SingleCartItem } from '../types'

export function blendIdentity(notes: CompleteSelection) {
  return `${notes.top.id}:${notes.middle.id}:${notes.base.id}`
}

export function cartIdentity(notes: CompleteSelection, size: BottleSize) {
  return `${blendIdentity(notes)}:${size}`
}

export function playSetIdentity(blends: CompleteSelection[]) {
  return `play-set:${blends.map(blendIdentity).join('|')}`
}

export function isPlaySet(item: SingleCartItem | PlaySetCartItem): item is PlaySetCartItem {
  return item.kind === 'play-set'
}

export function sameBlendAndSize(item: SingleCartItem, notes: CompleteSelection, size: BottleSize) {
  return item.size === size && blendIdentity(item.notes) === blendIdentity(notes)
}
