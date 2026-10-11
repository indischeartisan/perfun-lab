export function quoteExpired(quote: { expires_at: string }, now = Date.now()) { return Number.isNaN(Date.parse(quote.expires_at)) || Date.parse(quote.expires_at) <= now }
