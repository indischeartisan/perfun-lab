export function shouldAutoReview(mode: string, addressId: string, shippingQuoteId: string | null | undefined) {
  return mode === 'shipping' && Boolean(addressId) && Boolean(shippingQuoteId)
}

export function canSubmitReviewedOrder(mode: string, quoteToken: string | null | undefined, submitting: boolean, reviewing: boolean) {
  return mode === 'shipping' && Boolean(quoteToken) && !submitting && !reviewing
}
