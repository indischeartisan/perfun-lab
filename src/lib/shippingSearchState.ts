/**
 * Keeps an older destination-search response from replacing a newer query.
 * The network request itself may already be in flight, but its result becomes
 * irrelevant as soon as the next revision begins.
 */
export function createShippingSearchRequestGate() {
  let current = 0
  return {
    begin() { current += 1; return current },
    invalidate() { current += 1 },
    isCurrent(revision: number) { return revision === current }
  }
}
