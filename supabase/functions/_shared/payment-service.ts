import { CreationRejected, PaymentError, type Payment, type PaymentProvider, type ProviderEvent } from './payment-provider.ts'

export interface PaymentRepository {
  reserve(orderId: string, userId: string): Promise<Payment>
  byOrder(orderId: string, userId: string): Promise<Payment | null>
  byReference(reference: string): Promise<Payment | null>
  attach(payment: Payment, url: string, metadata: Record<string, unknown>): Promise<Payment>
  apply(payment: Payment, event: ProviderEvent, key: string): Promise<void>
}
export async function digestHex(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('')
}
export async function reconcile(payment: Payment, repo: PaymentRepository, provider: PaymentProvider) {
  if (Date.now() - Date.parse(payment.created_at) < 60000) return // DOKU recommends waiting before status queries.
  const event = await provider.status(payment)
  if (event) await repo.apply(payment, event, 'status:' + await digestHex(JSON.stringify(event)))
}
export async function initiatePayment(orderId: string, userId: string, repo: PaymentRepository, provider: PaymentProvider) {
  let payment = await repo.reserve(orderId, userId)
  if (payment.payment_url) {
    await reconcile(payment, repo, provider)
    // Revalidate the order after reconciliation. A paid order cannot open another payment.
    payment = await repo.reserve(orderId, userId)
  }
  if (!payment.payment_url) {
    try {
      const session = await provider.create(payment)
      payment = await repo.attach(payment, session.url, session.metadata)
    } catch (error) {
      if (error instanceof CreationRejected) await repo.apply(payment, { reference: payment.provider_reference, amount: payment.amount, status: 'failed', paidAt: null, metadata: { source: 'create_rejected' } }, 'create-rejected:' + payment.id)
      throw error // Unknown outcomes keep the same reservation/reference for safe retry.
    }
  }
  if (payment.status !== 'pending') throw new PaymentError('Payment status changed. Refresh your order.', 409)
  if (!payment.payment_url || !provider.validPaymentUrl(payment.payment_url)) throw new PaymentError('Invalid payment link')
  return { payment_id: payment.id, payment_url: payment.payment_url, status: payment.status }
}
export async function processWebhook(request: Request, repo: PaymentRepository, provider: PaymentProvider, target: string) {
  if (request.method !== 'POST') throw new PaymentError('Method not allowed', 405)
  if (Number(request.headers.get('content-length') ?? 0) > 65536) throw new PaymentError('Notification too large', 413)
  const body = await request.text()
  if (new TextEncoder().encode(body).length > 65536) throw new PaymentError('Notification too large', 413)
  await provider.verifyNotification(request.headers, body, target)
  let event: ProviderEvent
  try { event = provider.notification(body) } catch (error) { if (error instanceof PaymentError) throw error; throw new PaymentError('Invalid notification', 400) }
  const payment = await repo.byReference(event.reference)
  if (!payment) throw new PaymentError('Payment reference not found', 404)
  if (event.amount !== payment.amount) throw new PaymentError('Payment amount mismatch', 400)
  await repo.apply(payment, event, 'webhook:' + await digestHex(body))
  return { received: true }
}
