// Read every row, rather than assuming one PostgREST response contains an order.
// The caller supplies a stable order and an exact count on every request.
export async function collectPagedSnapshots<T extends { id: string }>(
  fetchPage: (from: number, to: number) => Promise<{ rows: T[]; count: number | null }>,
  pageSize = 100,
): Promise<T[]> {
  const rows: T[] = []
  const ids = new Set<string>()
  let expectedCount: number | null = null
  for (;;) {
    const page = await fetchPage(rows.length, rows.length + pageSize - 1)
    if (page.count === null || (expectedCount !== null && page.count !== expectedCount)) {
      throw new Error('The order snapshot changed or could not be verified. Retry before copying or printing.')
    }
    expectedCount = page.count
    if (page.rows.length === 0 && rows.length < expectedCount) {
      throw new Error('The order snapshot is incomplete. Retry before copying or printing.')
    }
    for (const row of page.rows) {
      if (ids.has(row.id)) throw new Error('The order snapshot changed while loading. Retry before copying or printing.')
      ids.add(row.id)
      rows.push(row)
    }
    if (rows.length > expectedCount) throw new Error('The order snapshot changed while loading. Retry before copying or printing.')
    if (rows.length === expectedCount) return rows
  }
}
