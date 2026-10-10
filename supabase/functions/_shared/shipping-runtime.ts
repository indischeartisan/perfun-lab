import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { ShippingError } from './rajaongkir.ts'

export function shippingCors(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const allowed = (Deno.env.get('SHIPPING_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const app = Deno.env.get('APP_URL')
  if (app) { try { allowed.push(new URL(app).origin) } catch { /* checked at deployment */ } }
  if ((Deno.env.get('SHIPPING_ENVIRONMENT') ?? 'sandbox') === 'sandbox') allowed.push('http://localhost:5173','http://127.0.0.1:5173')
  return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : '', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store' }
}
export function shippingFailure(error: unknown, req: Request) {
  const known = error instanceof ShippingError ? error : new ShippingError('Shipping service is unavailable. Please try again.')
  return Response.json({ error: known.message }, { status: known.status, headers: shippingCors(req) })
}
export async function shippingJson(req: Request, maximumBytes = 16_384): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > maximumBytes) throw new ShippingError('Shipping request is too large', 413)
  const raw = await req.text()
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) throw new ShippingError('Shipping request is too large', 413)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    return parsed as Record<string, unknown>
  } catch {
    throw new ShippingError('Invalid shipping request', 400)
  }
}
export function shippingAdmin() {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new ShippingError('Shipping service is not configured', 503)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export async function shippingUser(req: Request) {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) throw new ShippingError('Sign in required', 401)
  const db = shippingAdmin(), { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new ShippingError('Invalid session. Please sign in again.', 401)
  const profile = await db.from('profiles').select('role').eq('id',data.user.id).single()
  if (profile.error || profile.data.role !== 'customer') throw new ShippingError('Customer account required', 403)
  return data.user.id
}
export async function shippingRpc<T>(name: string,args: Record<string, unknown>) {
  const { data,error } = await shippingAdmin().rpc(name,args)
  if (error) throw new ShippingError(error.code === '42501' ? 'Address not found' : error.message, error.code === '42501' ? 403 : error.code === 'P0001' ? 429 : 409)
  return data as T
}
export function shippingProvider() {
  const key = Deno.env.get('RAJAONGKIR_SHIPPING_COST_API_KEY'), baseUrl = Deno.env.get('RAJAONGKIR_SHIPPING_COST_BASE_URL')
  if (!key || !baseUrl) throw new ShippingError('Shipping service is not configured',503)
  try {
    const url = new URL(baseUrl)
    // A Shipping Cost sandbox host must be confirmed by RajaOngkir before it is configured.
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.komerce.id') || !url.pathname.startsWith('/api/v1')) throw new Error('invalid')
    return { key, baseUrl: url.toString() }
  } catch {
    throw new ShippingError('Shipping service is not configured',503)
  }
}
