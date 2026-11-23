import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { DokuProvider, signature, parseDokuEvent, parseDokuExpiry } from '../supabase/functions/_shared/doku.ts'
import { initiatePayment, processWebhook } from '../supabase/functions/_shared/payment-service.ts'
import { CreationRejected } from '../supabase/functions/_shared/payment-provider.ts'
import { paymentErrorMessage } from '../src/lib/paymentErrorMessage.ts'

const config = { clientId: 'test-client', secret: 'test-only-secret', environment: 'sandbox' }
const payment = () => ({ id: 'e3000000-0000-4000-8000-000000000001', order_id: 'test-order', provider: 'doku', environment: 'sandbox', provider_reference: 'PF123456789', amount: 109000, currency: 'IDR', status: 'pending', payment_url: null, created_at: new Date().toISOString(), payment_deadline_at: new Date(Date.now() + 60 * 60000).toISOString(), request_payload: { amount: 109000, currency: 'IDR', return_url: 'https://shop.example/#orders' } })
const body = (status = 'SUCCESS', amount = 109000, type = 'SALE') => JSON.stringify({ order: { invoice_number: 'PF123456789', amount }, transaction: { status, type, date: '2026-09-08T08:00:00Z' } })
const target = '/functions/v1/payments-webhook'
const dokuExpiry = (date) => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value])); return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}` }
async function signedRequest(raw, path = target) {
  const timestamp = '2026-09-01T00:00:00Z' // Valid old signature: notification retries must remain processable.
  return new Request('https://project.supabase.co'+target, { method: 'POST', headers: { 'Client-Id': config.clientId, 'Request-Id': 'event-1', 'Request-Timestamp': timestamp, Signature: await signature(config.secret, config.clientId, 'event-1', timestamp, path, raw) }, body: raw })
}
function fakeRepo(p = payment()) {
  const events = new Set(); let writes = 0
  return { p, get writes() { return writes }, reserve: async () => p, byReference: async ref => ref === p.provider_reference ? p : null,
    attach: async (_p, url) => { p.payment_url = url; return p },
    apply: async (_p, event, key) => { if (events.has(key)) return; events.add(key); writes++; p.status = event.status },
  }
}

test('POST signature matches independent crypto calculation; GET omits Digest', async () => {
  const raw = body(), stamp = '2026-09-01T00:00:00Z'
  const base = `Client-Id:test-client\nRequest-Id:r1\nRequest-Timestamp:${stamp}\nRequest-Target:${target}`
  for (const data of [undefined, raw]) {
    const components = base + (data === undefined ? '' : '\nDigest:' + createHash('sha256').update(data).digest('base64'))
    assert.equal(await signature(config.secret, config.clientId, 'r1', stamp, target, data), 'HMACSHA256=' + createHmac('sha256', config.secret).update(components).digest('base64'))
  }
})
test('signed webhook updates payment once; repeated raw body is deduplicated', async () => {
  const repo = fakeRepo(), provider = new DokuProvider(config)
  await processWebhook(await signedRequest(body()), repo, provider, target)
  await processWebhook(await signedRequest(body()), repo, provider, target)
  assert.equal(repo.p.status, 'paid'); assert.equal(repo.writes, 1)
})
test('forged signature, tampered body, wrong path, wrong client and wrong amount cannot write', async () => {
  const repo = fakeRepo(), provider = new DokuProvider(config)
  const valid = await signedRequest(body())
  const forged = new Request(valid.url, { method: 'POST', headers: valid.headers, body: body('SUCCESS', 1) })
  await assert.rejects(processWebhook(forged, repo, provider, target), /signature/)
  await assert.rejects(processWebhook(await signedRequest(body(), '/wrong'), repo, provider, target), /signature/)
  const wrongClient = await signedRequest(body()); wrongClient.headers.set('Client-Id', 'someone-else')
  await assert.rejects(processWebhook(wrongClient, repo, provider, target), /signature/)
  await assert.rejects(processWebhook(await signedRequest(body('SUCCESS', 1)), repo, provider, target), /amount mismatch/)
  assert.equal(repo.writes, 0)
})
test('DOKU Checkout distinguishes failed channel, order expiry, authorization, paid and refunded', () => {
  assert.equal(parseDokuEvent(JSON.parse(body('FAILED'))).status, 'pending')
  assert.equal(parseDokuEvent(JSON.parse(body('SUCCESS', 109000, 'AUTHORIZE'))).status, 'pending')
  assert.equal(parseDokuEvent(JSON.parse(body('SUCCESS', 109000, 'CAPTURE'))).status, 'paid')
  assert.equal(parseDokuEvent(JSON.parse(body('REFUNDED'))).status, 'refunded')
  const expired = JSON.parse(body('EXPIRED')); expired.order.status = 'ORDER_EXPIRED'
  assert.equal(parseDokuEvent(expired).status, 'expired')
})
test('DOKU expiry parser handles production UTC+7 format and date rollover', () => {
  assert.equal(parseDokuExpiry('20261122170304'), '2026-11-22T10:03:04.000Z')
  assert.equal(parseDokuExpiry('20270101000000'), '2026-12-31T17:00:00.000Z')
  for (const value of [undefined, '', '202611221703', '20260230000000', '20261122246000']) assert.equal(parseDokuExpiry(value), null)
})
test('create retries keep the same reference while recalculating duration from the deadline', async () => {
  const requests = []
  const provider = new DokuProvider(config, async (_url, init) => {
    requests.push(init)
    if (requests.length === 1) throw new TypeError('lost response after commit')
    return Response.json({ response: { order: { invoice_number: 'PF123456789', amount: 109000 }, payment: { url: 'https://sandbox.doku.com/checkout-link-v2/test', expired_date: dokuExpiry(new Date(Date.now() + 50 * 60000)) } } }, { status: 409 })
  })
  const repo = fakeRepo()
  await assert.rejects(initiatePayment('test-order','owner',repo,provider), /lost response/)
  assert.equal(repo.p.status,'pending')
  const result = await initiatePayment('test-order','owner',repo,provider)
  assert.ok(result.payment_url.startsWith('https://sandbox.doku.com/'))
  const firstBody = JSON.parse(requests[0].body), retryBody = JSON.parse(requests[1].body)
  assert.ok(retryBody.payment.payment_due_date <= firstBody.payment.payment_due_date)
  assert.ok(retryBody.payment.payment_due_date >= 1)
  assert.equal(requests[0].headers['Request-Id'],requests[1].headers['Request-Id'])
})
test('DOKU session duration never exceeds the authoritative order deadline', async () => {
  const requests = []
  const provider = new DokuProvider(config, async (_url, init) => {
    requests.push(JSON.parse(init.body))
    return Response.json({ response: { order: { invoice_number: 'PF123456789', amount: 109000 }, payment: { url: 'https://sandbox.doku.com/checkout-link-v2/test', expired_date: dokuExpiry(new Date(Date.now() + 17 * 60000)) } } })
  })
  await provider.create({ ...payment(), payment_deadline_at: new Date(Date.now() + 17 * 60000 + 50000).toISOString() })
  assert.equal(requests[0].payment.payment_due_date, 17)
})
test('provider expiry returned by DOKU cannot exceed the order deadline', async () => {
  const provider = new DokuProvider(config, async (_url, init) => {
    const providerExpiry = dokuExpiry(new Date(Date.now() + 11 * 60000))
    return Response.json({ response: { order: { invoice_number: 'PF123456789', amount: 109000 }, payment: { url: 'https://sandbox.doku.com/checkout-link-v2/test', expired_date: providerExpiry } } })
  })
  await assert.rejects(provider.create({ ...payment(), payment_deadline_at: new Date(Date.now() + 10 * 60000).toISOString() }), /exceeds order deadline/)
})
test('DOKU expiry is required and exactly at the order deadline is accepted', async () => {
  const deadline = new Date(Date.now() + 20 * 60000)
  const provider = new DokuProvider(config, async () => Response.json({ response: { order: { invoice_number: 'PF123456789', amount: 109000 }, payment: { url: 'https://sandbox.doku.com/checkout-link-v2/test', expired_date: dokuExpiry(deadline) } } }))
  await provider.create({ ...payment(), payment_deadline_at: deadline.toISOString() })
  const missing = new DokuProvider(config, async () => Response.json({ response: { order: { invoice_number: 'PF123456789', amount: 109000 }, payment: { url: 'https://sandbox.doku.com/checkout-link-v2/test' } } }))
  await assert.rejects(missing.create({ ...payment(), payment_deadline_at: deadline.toISOString() }), /Invalid payment provider expiry/)
})
test('sandbox accepts DOKU staging checkout host returned by the live API', () => {
  const provider = new DokuProvider(config)
  assert.equal(provider.validPaymentUrl('https://staging.doku.com/checkout-link-v2/test'), true)
  assert.equal(provider.validPaymentUrl('https://staging.doku.com.attacker.example/test'), false)
})
test('payment URL and provider amount are validated; unknown failures do not make a new attempt', async () => {
  const provider = new DokuProvider(config, async () => Response.json({ response: { order: { invoice_number: 'PF123456789', amount: 1 }, payment: { url: 'https://attacker.example/' } } }))
  await assert.rejects(provider.create(payment()), /Invalid payment provider/)
  assert.equal(provider.validPaymentUrl('https://sandbox.doku.com.attacker.example/test'),false)
  assert.equal(provider.validPaymentUrl('javascript:alert(1)'),false)
  const repo = fakeRepo()
  const rejected = { ...provider, create: async () => { throw new CreationRejected('rejected') } }
  await assert.rejects(initiatePayment('test-order','owner',repo,rejected), /rejected/)
  assert.equal(repo.p.status,'failed')
})

test('customer payment errors are Indonesian and do not expose provider details', () => {
  assert.equal(paymentErrorMessage(new Error('Payment service is unavailable. Please try again.')), 'Layanan pembayaran belum dapat dihubungi. Coba lagi beberapa saat.')
  assert.equal(paymentErrorMessage(new Error('Payments are not configured yet. Please contact the shop.')), 'Pembayaran belum siap. Silakan hubungi Perfun Lab.')
  assert.equal(paymentErrorMessage(new Error('unexpected upstream response: secret=never-show')), 'Layanan pembayaran belum dapat dihubungi. Coba lagi beberapa saat.')
})
