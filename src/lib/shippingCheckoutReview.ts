export interface ReviewedShippingQuote {
  original_shipping_amount: number
  shipping_discount: number
  customer_shipping_total: number
}

export function reviewedShippingBreakdown<T extends ReviewedShippingQuote>(quote: { shipping: number; shipping_quote_snapshot: T }) {
  const snapshot = quote.shipping_quote_snapshot
  const values = [snapshot?.original_shipping_amount, snapshot?.shipping_discount, snapshot?.customer_shipping_total]
  if (
    !snapshot
    || !Number.isSafeInteger(quote.shipping)
    || quote.shipping < 0
    || values.some(value => !Number.isSafeInteger(value) || value < 0)
    || snapshot.shipping_discount > snapshot.original_shipping_amount
    || snapshot.original_shipping_amount - snapshot.shipping_discount !== snapshot.customer_shipping_total
    || snapshot.customer_shipping_total !== quote.shipping
  ) return null
  return snapshot
}
