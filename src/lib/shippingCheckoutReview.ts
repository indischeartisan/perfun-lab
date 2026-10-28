export interface ReviewedShippingQuote {
  original_shipping_amount: number
  shipping_discount: number
  customer_shipping_total: number
}

export function reviewedShippingBreakdown<T extends ReviewedShippingQuote>(quote: { shipping: number; shipping_quote_snapshot: T }) {
  const snapshot = quote.shipping_quote_snapshot
  const values = [snapshot?.original_shipping_amount, snapshot?.shipping_discount, snapshot?.customer_shipping_total]
  if (!snapshot || values.some(value => !Number.isSafeInteger(value) || value < 0) || snapshot.customer_shipping_total !== quote.shipping) return null
  return snapshot
}
