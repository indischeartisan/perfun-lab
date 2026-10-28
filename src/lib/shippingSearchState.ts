/**
 * Keeps an older destination-search response from replacing a newer query.
 * The network request itself may already be in flight, but its result becomes
 * irrelevant as soon as the next revision begins.
 */
export function createShippingSearchRequestGate() {
  let current = 0
  let loadingRevision: number | null = null
  return {
    begin() { current += 1; loadingRevision = null; return current },
    invalidate() { current += 1; loadingRevision = null },
    isCurrent(revision: number) { return revision === current },
    start(revision: number) {
      if (revision !== current) return false
      loadingRevision = revision
      return true
    },
    settle(revision: number) {
      if (revision !== current || loadingRevision !== revision) return false
      loadingRevision = null
      return true
    },
    isLoading() { return loadingRevision === current }
  }
}
