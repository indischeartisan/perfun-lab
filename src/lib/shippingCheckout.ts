const shippingUnavailable = 'Layanan pengiriman sedang disiapkan. Pesanan belum dapat dibuat karena ongkir belum tersedia.'
const buildShippingEnabled = import.meta.env?.VITE_SHIPPING_CHECKOUT_ENABLED

export function isShippingCheckoutEnabled(value: string | undefined = buildShippingEnabled) {
  return value === 'true'
}

export function shippingQuoteRequired(shippingEnabled: boolean, quoteId: string | null | undefined) {
  return shippingEnabled && !quoteId
}

export type ShippingReadiness = { enabled: boolean; ready: boolean }
export function checkoutShippingMode(buildEnabled: boolean, status: ShippingReadiness | null): 'loading' | 'paused' | 'shipping' | 'update' | 'unavailable' {
  if (!status) return 'loading'
  if (!status.enabled) return 'paused'
  if (!buildEnabled) return 'update'
  return status.ready ? 'shipping' : 'unavailable'
}

export function checkoutErrorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'Checkout tidak dapat diproses. Silakan coba lagi.'

  if (/quote_order|place_order|PGRST202|shipping checkout is not enabled|shipping origin is not verified/i.test(message)) {
    return shippingUnavailable
  }

  return message
}

export { shippingUnavailable }
