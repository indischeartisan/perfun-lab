type DestinationAddress = {
  rajaongkir_destination_id?: number | null
  rajaongkir_destination_label?: Record<string, unknown> | null
  rajaongkir_destination_verified_at?: string | null
}

export function hasVerifiedShippingDestination(address: DestinationAddress | null | undefined): boolean {
  const id = address?.rajaongkir_destination_id
  const label = address?.rajaongkir_destination_label
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !address?.rajaongkir_destination_verified_at || !label || typeof label !== 'object' || Array.isArray(label)) return false
  return ['name', 'city', 'province', 'postal_code'].every(key => typeof label[key] === 'string' && label[key].trim().length > 0)
}

/** The current shipping mode, not only the editor's initial state, controls saving. */
export function canSaveShippingAddress(shippingEnabled: boolean, original: DestinationAddress | null, hasSelectedDestination: boolean, needsLocation: boolean): boolean {
  return !shippingEnabled || (!needsLocation && (hasSelectedDestination || hasVerifiedShippingDestination(original)))
}

/** Invalidates quote callbacks as soon as address selection or item identity changes. */
export function createShippingQuoteOwnerGate(initialItems: string) {
  let addressRevision = 0
  let items = initialItems
  return {
    nextAddress() { addressRevision += 1; return addressRevision },
    updateItems(next: string) { if (next === items) return null; items = next; addressRevision += 1; return addressRevision },
    accepts(address: number, fingerprint: string) { return address === addressRevision && fingerprint === items },
  }
}
