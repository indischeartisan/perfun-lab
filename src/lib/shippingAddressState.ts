type DestinationAddress = {
  city?: string | null
  province?: string | null
  district?: string | null
  postal_code?: string | null
  rajaongkir_destination_id?: number | null
  rajaongkir_destination_label?: Record<string, unknown> | null
  rajaongkir_destination_verified_at?: string | null
}

type ShippingDestinationState = 'missing' | 'inconsistent' | 'valid'
const normalize = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : ''

/** Compare stored address fields to the verified provider label, including legacy labels. */
export function shippingDestinationState(address: DestinationAddress | null | undefined): ShippingDestinationState {
  const id = address?.rajaongkir_destination_id
  const label = address?.rajaongkir_destination_label
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !address?.rajaongkir_destination_verified_at || !label || typeof label !== 'object' || Array.isArray(label)) return 'missing'
  if (!['name', 'city', 'province', 'postal_code'].every(key => normalize(label[key]).length > 0)) return 'missing'
  const district = normalize(label.district), subdistrict = normalize(label.subdistrict)
  const expectedDistrict = subdistrict && district && subdistrict !== district ? `${subdistrict}, ${district}` : subdistrict || district
  if (normalize(address.city) !== normalize(label.city) || normalize(address.province) !== normalize(label.province) || normalize(address.postal_code) !== normalize(label.postal_code) || normalize(address.district) !== expectedDistrict) return 'inconsistent'
  return 'valid'
}

export function hasVerifiedShippingDestination(address: DestinationAddress | null | undefined): boolean {
  return shippingDestinationState(address) === 'valid'
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
