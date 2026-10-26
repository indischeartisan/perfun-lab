import type { ShippingDetails } from './shipments'

export function validateDispatchDetails(details: ShippingDetails): string | null {
  const fields: Array<[string, string, number]> = [
    ['Courier', details.courier, 100], ['Service', details.service, 100], ['Tracking number', details.tracking_number, 150],
  ]
  for (const [label, value, limit] of fields) {
    if (!value.trim()) return `${label} is required.`
    if (value.length > limit || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return `${label} contains invalid characters or is too long.`
  }
  return null
}

export function parseActualShippingCost(input: string): number | null {
  if (!/^\d+$/.test(input)) return null
  const cost = Number(input)
  return Number.isSafeInteger(cost) ? cost : null
}
