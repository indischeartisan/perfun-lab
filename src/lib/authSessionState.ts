export function preservesAuthenticatedProfile(previousUserId: string | null, nextUserId: string | null): boolean {
  return Boolean(previousUserId && nextUserId && previousUserId === nextUserId)
}

/** Tracks the account that owns a profile request and rejects late responses. */
export function createAuthProfileRequestGuard() {
  let generation = 0
  let currentUserId: string | null = null
  return {
    switchTo(userId: string | null) {
      if (userId !== currentUserId) { currentUserId = userId; generation += 1 }
      return generation
    },
    begin(userId: string) {
      return this.switchTo(userId)
    },
    accepts(requestGeneration: number, userId: string) {
      return Boolean(currentUserId === userId && userId && requestGeneration === generation)
    },
  }
}
