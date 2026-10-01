import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { DokuProvider } from './doku.ts'
import { PaymentError, type Payment } from './payment-provider.ts'
import type { PaymentRepository } from './payment-service.ts'

export function cors(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const app = Deno.env.get('APP_URL')
  const allowed = (Deno.env.get('PAYMENT_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim()).filter(Boolean)
  if (app) { try { allowed.push(new URL(app).origin) } catch { /* configuration error reported by setup */ } }
  if ((Deno.env.get('PAYMENT_ENVIRONMENT') ?? 'sandbox') === 'sandbox') allowed.push('http://localhost:5173', 'http://127.0.0.1:5173')
  return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : '', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store' }
}
export function failure(error: unknown, req?: Request) {
  const status = error instanceof PaymentError ? error.status : 500
  // Never serialize provider credentials, authorization headers, or raw provider response bodies.
  const message = error instanceof PaymentError ? error.message : 'Payment processing is unavailable. Please retry.'
  return Response.json({ error: message }, { status, headers: req ? cors(req) : { 'Cache-Control': 'no-store' } })
}
function adminClient() {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new PaymentError('Payment service is not configured', 503)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export async function authenticated(req: Request) {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) throw new PaymentError('Sign in required', 401)
  const db = adminClient()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new PaymentError('Invalid session. Please sign in again.', 401)
  const profile = await db.from('profiles').select('role').eq('id', data.user.id).single()
  if (profile.error) throw new PaymentError('Unable to verify account access', 503)
  if (profile.data.role === 'vendor') throw new PaymentError('Vendor accounts can only access fulfillment', 403)
  return data.user.id
}
export function setup() {
  const providerName = Deno.env.get('PAYMENT_PROVIDER') ?? 'doku'
  const environment = Deno.env.get('PAYMENT_ENVIRONMENT') ?? 'sandbox'
  const clientId = Deno.env.get('DOKU_CLIENT_ID'), secret = Deno.env.get('DOKU_SECRET_KEY'), app = Deno.env.get('APP_URL')
  if (providerName !== 'doku' || !['sandbox', 'production'].includes(environment) || !clientId || !secret || !app) throw new PaymentError('Payments are not configured yet. Please contact the shop.', 503)
  const returnUrl = new URL(app)
  if (returnUrl.protocol !== 'https:' && !(environment === 'sandbox' && ['localhost', '127.0.0.1'].includes(returnUrl.hostname) && returnUrl.protocol === 'http:')) throw new PaymentError('Invalid payment return URL', 503)
  returnUrl.search = ''; returnUrl.hash = 'orders'
  const notificationUrl = new URL(Deno.env.get('DOKU_NOTIFICATION_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/payments-webhook`)
  if (notificationUrl.protocol !== 'https:' || notificationUrl.search || notificationUrl.hash) throw new PaymentError('Invalid notification URL', 503)
  const provider = new DokuProvider({ clientId, secret, environment: environment as 'sandbox' | 'production' })
  const db = adminClient()
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args)
    if (error) throw new PaymentError(error.code === '42501' ? 'Order not found' : 'Payment status changed or service unavailable. Refresh and try again.', error.code === '42501' ? 404 : error.code === 'P0001' ? 409 : 500)
    return data
  }
  const repo: PaymentRepository = {
    async reserve(orderId, userId) { return await rpc('reserve_payment', { p_order_id: orderId, p_user_id: userId, p_provider: providerName, p_environment: environment, p_return_url: returnUrl.toString() }) as Payment },
    async byOrder(orderId, userId) {
      const owner = await db.from('orders').select('id').eq('id', orderId).eq('user_id', userId).maybeSingle()
      if (owner.error) throw new PaymentError('Unable to read order', 500)
      if (!owner.data) throw new PaymentError('Order not found', 404)
      const result = await db.from('payments').select('*').eq('order_id', orderId).eq('provider', providerName).eq('environment', environment).order('attempt_sequence', { ascending: false }).limit(1).maybeSingle()
      if (result.error) throw new PaymentError('Unable to read payment', 500)
      return result.data as Payment | null
    },
    async byReference(reference) {
      const result = await db.from('payments').select('*').eq('provider', providerName).eq('environment', environment).eq('provider_reference', reference).maybeSingle()
      if (result.error) throw new PaymentError('Unable to read payment', 500)
      return result.data as Payment | null
    },
    async attach(payment, url, metadata) { return await rpc('attach_payment_session', { p_payment_id: payment.id, p_url: url, p_metadata: metadata }) as Payment },
    async apply(payment, event, key) { await rpc('apply_payment_event', { p_payment_id: payment.id, p_event_key: key, p_amount: event.amount, p_status: event.status, p_paid_at: event.paidAt, p_metadata: event.metadata }) },
  }
  return { repo, provider, notificationTarget: notificationUrl.pathname }
}
export async function orderId(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > 2048) throw new PaymentError('Request too large', 413)
  const raw = await req.text()
  if (raw.length > 2048) throw new PaymentError('Request too large', 413)
  let data: Record<string, unknown>
  try { data = JSON.parse(raw) } catch { throw new PaymentError('Invalid request', 400) }
  if (!data || typeof data.order_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.order_id)) throw new PaymentError('Invalid order', 400)
  return data.order_id
}
