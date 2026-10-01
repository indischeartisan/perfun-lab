const idrNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export function formatPrice(price: number) {
  return `Rp${idrNumber.format(price)}`
}
