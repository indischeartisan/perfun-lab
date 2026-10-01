import { failure, setup } from '../_shared/runtime.ts'
import { processWebhook } from '../_shared/payment-service.ts'

Deno.serve(async req => {
  try {
    const { repo, provider, notificationTarget } = setup()
    return Response.json(await processWebhook(req, repo, provider, notificationTarget))
  } catch (error) { return failure(error) }
})
