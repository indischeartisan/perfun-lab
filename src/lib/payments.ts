import { requireSupabase } from './supabase'

export async function paymentRequest(endpoint: 'payments-create' | 'payments-sync', orderId: string) {
  const { data, error } = await requireSupabase().functions.invoke(endpoint, { body: { order_id: orderId } })
  if (error) {
    let message = 'Payment service is unavailable. Please try again.'
    if ('context' in error && error.context instanceof Response) {
      try { const response = await error.context.json(); if (typeof response.error === 'string') message = response.error } catch { /* network/gateway failure */ }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data as { payment_url?: string }
}
