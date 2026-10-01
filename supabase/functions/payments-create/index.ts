import { authenticated, cors, failure, orderId, setup } from '../_shared/runtime.ts'
import { initiatePayment } from '../_shared/payment-service.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: cors(req) })
  try {
    const userId = await authenticated(req), id = await orderId(req)
    const { repo, provider } = setup()
    return Response.json(await initiatePayment(id, userId, repo, provider), { headers: cors(req) })
  } catch (error) { return failure(error, req) }
})
