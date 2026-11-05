export type PersistedCartSelection = { initialized: boolean; ids: string[] }

export function reconcileCartSelection(itemIds: string[], selection: PersistedCartSelection): PersistedCartSelection {
  const ids = selection.initialized ? selection.ids.filter(id => itemIds.includes(id)) : itemIds
  return { initialized: true, ids: [...new Set(ids)] }
}

export function remapSelectedCartItem(selection: PersistedCartSelection, previousId: string, nextId: string): PersistedCartSelection {
  if (!selection.initialized || !selection.ids.includes(previousId)) return selection
  return { ...selection, ids: [...new Set(selection.ids.filter(id => id !== previousId).concat(nextId))] }
}

export function removeSelectedCartItems<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const removed = new Set(ids)
  return items.filter(item => !removed.has(item.id))
}
