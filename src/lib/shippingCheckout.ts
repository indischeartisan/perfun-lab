const shippingUnavailable = 'Shipping belum tersedia. Checkout akan dibuka setelah layanan pengiriman siap.'
const buildShippingEnabled = import.meta.env?.VITE_SHIPPING_CHECKOUT_ENABLED

export function isShippingCheckoutEnabled(value: string | undefined = buildShippingEnabled) {
  return value === 'true'
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
