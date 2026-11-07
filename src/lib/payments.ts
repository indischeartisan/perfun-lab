import { requireSupabase } from './supabase'
import { paymentErrorMessage } from './paymentErrorMessage'

const unavailable = 'Layanan pembayaran belum dapat dihubungi. Coba lagi beberapa saat.'

export async function paymentRequest(endpoint: 'payments-create' | 'payments-sync', orderId: string) {
  const { data, error } = await requireSupabase().functions.invoke(endpoint, { body: { order_id: orderId } })
  if (error) {
    let message = unavailable
    if ('context' in error && error.context instanceof Response) {
      try { const response = await error.context.json(); if (typeof response.error === 'string') message = response.error } catch { /* network/gateway failure */ }
    }
    throw new Error(paymentErrorMessage(new Error(message)))
  }
  if (data?.error) throw new Error(paymentErrorMessage(new Error(String(data.error))))
  return data as { payment_url?: string }
}
