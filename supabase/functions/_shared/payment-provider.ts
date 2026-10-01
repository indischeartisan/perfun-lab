export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'
export interface Payment {
  id: string; order_id: string; provider: string; environment: 'sandbox' | 'production'; provider_reference: string
  amount: number; currency: string; status: PaymentStatus; payment_url: string | null; created_at: string
  request_payload: { amount: number; currency: string; return_url: string }
}
export interface ProviderEvent { reference: string; amount: number; status: PaymentStatus; paidAt: string | null; metadata: Record<string, unknown> }
export interface ProviderSession { url: string; metadata: Record<string, unknown> }
export interface PaymentProvider {
  name: string
  create(payment: Payment): Promise<ProviderSession>
  status(payment: Payment): Promise<ProviderEvent | null>
  verifyNotification(headers: Headers, body: string, target: string): Promise<void>
  notification(body: string): ProviderEvent
  validPaymentUrl(url: string): boolean
}
export class PaymentError extends Error {
  status: number
  constructor(message: string, status = 502) { super(message); this.status = status }
}
export class CreationRejected extends PaymentError {}
