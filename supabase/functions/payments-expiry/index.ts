import { cors, failure, serviceClient, setup } from '../_shared/runtime.ts'
import { digestHex } from '../_shared/payment-service.ts'
import type { Payment } from '../_shared/payment-provider.ts'

const tokenHeader = 'x-perfun-payment-expiry-token'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: cors(req) })
  try {
    const token = req.headers.get(tokenHeader)
    if (!token || token.length > 128) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors(req) })
    const db = serviceClient()
    const authorized = await db.rpc('payment_expiry_authorize', { p_token: token })
    if (authorized.error || authorized.data !== true) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors(req) })

    const { repo, provider } = setup()
    const expired = await db.rpc('expire_unstarted_payment_orders', { p_limit: 50 })
    if (expired.error) throw expired.error
    const batch = await db.rpc('payment_expiry_candidates', { p_limit: 50 })
    if (batch.error) throw batch.error
    const pending = Array.isArray(batch.data?.pending) ? batch.data.pending as Payment[] : []
    let finalized = 0
    let checked = 0
    for (const payment of pending) {
      checked++
      try {
        const event = await provider.status(payment)
        if (event && (event.status === 'paid' || event.status === 'expired')) {
          await repo.apply(payment, event, 'expiry:' + await digestHex(JSON.stringify(event)))
          finalized++
        }
      } catch {
        // A transient provider error must not release an outstanding reservation.
      }
    }
    return Response.json({ expired_unstarted: expired.data ?? 0, checked, finalized }, { headers: cors(req) })
  } catch (error) { return failure(error, req) }
})
