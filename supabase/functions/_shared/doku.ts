import { CreationRejected, PaymentError, type Payment, type PaymentProvider, type ProviderEvent, type ProviderSession } from './payment-provider.ts'

type Json = Record<string, unknown>
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const bytes = (value: string) => new TextEncoder().encode(value)
const base64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)))
export async function bodyDigest(body: string) { return base64(await crypto.subtle.digest('SHA-256', bytes(body))) }

export async function signature(secret: string, clientId: string, requestId: string, timestamp: string, target: string, body?: string) {
  const components = [`Client-Id:${clientId}`, `Request-Id:${requestId}`, `Request-Timestamp:${timestamp}`, `Request-Target:${target}`]
  if (body !== undefined) components.push(`Digest:${await bodyDigest(body)}`)
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return 'HMACSHA256=' + base64(await crypto.subtle.sign('HMAC', key, bytes(components.join('\n'))))
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}
export function amount(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(\.0+)?$/.test(String(value))) throw new PaymentError('Invalid provider amount', 400)
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0) throw new PaymentError('Invalid provider amount', 400)
  return result
}
export function parseDokuEvent(data: unknown): ProviderEvent {
  const payload = object(data), order = object(payload.order), transaction = object(payload.transaction)
  const reference = String(order.invoice_number ?? '')
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(reference)) throw new PaymentError('Invalid provider reference', 400)
  if (order.currency && order.currency !== 'IDR') throw new PaymentError('Currency mismatch', 400)
  const raw = String(transaction.status ?? ''), type = String(transaction.type ?? object(payload.card_payment).type ?? '')
  let status: ProviderEvent['status'] = 'pending'
  if (raw === 'REFUNDED') status = 'refunded'
  else if (raw === 'SUCCESS' && type === 'REFUND') status = 'refunded'
  else if (raw === 'SUCCESS' && type !== 'AUTHORIZE' && object(payload.service).id !== 'CREDIT_CARD_AUTHORIZE') status = 'paid'
  else if (order.status === 'ORDER_EXPIRED') status = 'expired'
  else if (!['', 'PENDING', 'FAILED', 'EXPIRED', 'TIMEOUT', 'REDIRECT', 'SUCCESS'].includes(raw)) throw new PaymentError('Unrecognized provider status', 422)
  // Checkout allows changing channel after a failed/expired channel attempt. Only order-level expiry ends the session.
  const date = typeof transaction.date === 'string' && Number.isFinite(Date.parse(transaction.date)) ? new Date(transaction.date).toISOString() : null
  return { reference, amount: amount(order.amount), status, paidAt: status === 'paid' ? date : null,
    metadata: { transaction_status: raw, transaction_type: type, order_status: order.status ?? null, transaction_date: date } }
}

export interface DokuConfig { clientId: string; secret: string; environment: 'sandbox' | 'production' }
export class DokuProvider implements PaymentProvider {
  name = 'doku'
  private config: DokuConfig
  private send: typeof fetch
  constructor(config: DokuConfig, send: typeof fetch = fetch) { this.config = config; this.send = send }
  validPaymentUrl(value: string) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && (this.config.environment === 'sandbox' ? ['sandbox.doku.com', 'staging.doku.com'].includes(url.hostname) : ['checkout.doku.com', 'pay.doku.com'].includes(url.hostname)) }
    catch { return false }
  }
  async verifyNotification(headers: Headers, body: string, target: string) {
    const client = headers.get('Client-Id'), id = headers.get('Request-Id'), timestamp = headers.get('Request-Timestamp'), actual = headers.get('Signature')
    if (client !== this.config.clientId || !id || id.length > 128 || !timestamp || !actual || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > Date.now() + 300000) throw new PaymentError('Invalid notification signature', 401)
    const expected = await signature(this.config.secret, client, id, timestamp, target, body)
    if (!constantTimeEqual(actual, expected)) throw new PaymentError('Invalid notification signature', 401)
    // Old correctly signed notifications are allowed: DOKU retries up to 12 hours and supports manual retries.
  }
  notification(body: string) { return parseDokuEvent(JSON.parse(body)) }
  async request(method: string, path: string, requestId: string, body?: string) {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    const headers = { 'Client-Id': this.config.clientId, 'Request-Id': requestId, 'Request-Timestamp': timestamp,
      Signature: await signature(this.config.secret, this.config.clientId, requestId, timestamp, path, body), 'Content-Type': 'application/json' }
    const host = this.config.environment === 'sandbox' ? 'https://api-sandbox.doku.com' : 'https://api.doku.com'
    return this.send(host + path, { method, headers, body, signal: AbortSignal.timeout(20000), redirect: 'error' })
  }
  async create(payment: Payment): Promise<ProviderSession> {
    const body = JSON.stringify({ order: { amount: payment.amount, invoice_number: payment.provider_reference, currency: payment.currency,
      callback_url: payment.request_payload.return_url }, payment: { payment_due_date: 60 } })
    const response = await this.request('POST', '/checkout/v1/payment', payment.id, body)
    if ([400, 422].includes(response.status)) throw new CreationRejected('Provider rejected the payment request. Please try again or contact support.', 502)
    // DOKU returns the original response with HTTP 409 when the same Request-Id/body is retried.
    if (!response.ok && response.status !== 409) throw new PaymentError('Payment provider unavailable. Please retry the same payment.')
    const data = object(await response.json()), result = object(data.response), order = object(result.order), session = object(result.payment)
    if (order.invoice_number !== payment.provider_reference || amount(order.amount) !== payment.amount || typeof session.url !== 'string' || !this.validPaymentUrl(session.url)) throw new PaymentError('Invalid payment provider response')
    return { url: session.url, metadata: { expired_date: session.expired_date ?? null } }
  }
  async status(payment: Payment): Promise<ProviderEvent | null> {
    const response = await this.request('GET', '/orders/v1/status/' + encodeURIComponent(payment.provider_reference), crypto.randomUUID())
    if (response.status === 404) return null
    if (!response.ok) throw new PaymentError('Unable to verify payment status. Please try again.')
    const event = parseDokuEvent(await response.json())
    if (event.reference !== payment.provider_reference || event.amount !== payment.amount) throw new PaymentError('Provider status does not match payment')
    return event
  }
}
