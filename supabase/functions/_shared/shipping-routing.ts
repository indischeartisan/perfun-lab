import { ShippingError, type Rate } from './rajaongkir.ts'

/**
 * This resolver deliberately accepts only canonical, provider-sourced province
 * labels. It never infers an island from a free-form customer address.
 */
export const SHIPPING_ROUTING_VERSION = 'indonesia-province-v1'
export type ShippingRegion = 'java' | 'outside-java'
export interface ShippingRoute {
  version: typeof SHIPPING_ROUTING_VERSION
  originRegion: ShippingRegion
  destinationRegion: ShippingRegion
  courier: 'jnt' | 'anteraja'
}

const javaProvinces = new Set([
  'banten', 'dki jakarta', 'jakarta', 'jawa barat', 'jawa tengah',
  'daerah istimewa yogyakarta', 'di yogyakarta', 'yogyakarta', 'jawa timur',
])

const outsideJavaProvinces = new Set([
  'aceh', 'sumatera utara', 'sumatera barat', 'riau', 'kepulauan riau', 'jambi', 'sumatera selatan', 'kepulauan bangka belitung', 'bengkulu', 'lampung',
  'kalimantan barat', 'kalimantan tengah', 'kalimantan selatan', 'kalimantan timur', 'kalimantan utara',
  'sulawesi utara', 'gorontalo', 'sulawesi tengah', 'sulawesi barat', 'sulawesi selatan', 'sulawesi tenggara',
  'bali', 'nusa tenggara barat', 'nusa tenggara timur',
  'maluku', 'maluku utara', 'papua', 'papua barat', 'papua selatan', 'papua tengah', 'papua pegunungan', 'papua barat daya',
])

function canonicalProvince(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ')
  return normalized || null
}

/** Returns null for an absent, ambiguous, or unsupported provider region. */
export function resolveShippingRegion(label: Record<string, unknown>): ShippingRegion | null {
  const province = canonicalProvince(label.province)
  if (!province) return null
  if (javaProvinces.has(province)) return 'java'
  if (outsideJavaProvinces.has(province)) return 'outside-java'
  return null
}

export function assignAutomaticCourier(originLabel: Record<string, unknown>, destinationLabel: Record<string, unknown>): ShippingRoute {
  const originRegion = resolveShippingRegion(originLabel)
  const destinationRegion = resolveShippingRegion(destinationLabel)
  if (!originRegion || !destinationRegion) throw new ShippingError('Shipping region could not be verified for this route.', 422)
  return {
    version: SHIPPING_ROUTING_VERSION,
    originRegion,
    destinationRegion,
    courier: originRegion === destinationRegion ? 'jnt' : 'anteraja',
  }
}

/** Prevents a caller-supplied carrier from being selected after routing. */
export function selectAutomaticRate(rates: Rate[], route: ShippingRoute, service: string) {
  return rates.find(rate => rate.courier_code === route.courier && rate.service === service) ?? null
}
