import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { errorWithCause } from '../src/lib/errors.ts'
import { loadValue } from '../src/hooks/useLocalStorage.ts'
import { isCheckoutDraft, isCheckoutPending, readPendingCheckout } from '../src/lib/storageValidation.ts'

class MemoryStorage {
  values = new Map()

  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

function withStorage(name, run) {
  const storage = new MemoryStorage()
  const previous = globalThis[name]
  Object.defineProperty(globalThis, name, { configurable: true, value: storage })
  try { run(storage) } finally {
    if (previous === undefined) delete globalThis[name]
    else Object.defineProperty(globalThis, name, { configurable: true, value: previous })
  }
}

const noteGroups = {
  top: [{ id: 'yuzu' }],
  middle: [{ id: 'matcha' }],
  base: [{ id: 'amber' }],
}
const directItems = [{ product_id: '10ml', quantity: 1, formulas: [{ top: 'yuzu', middle: 'matcha', base: 'amber' }] }]

test('local storage keeps checkout data isolated by account key', () => {
  withStorage('localStorage', storage => {
    storage.setItem('perfun:user:alice:checkout-draft', JSON.stringify({ owner: 'alice' }))
    storage.setItem('perfun:user:bob:checkout-draft', JSON.stringify({ owner: 'bob' }))
    const restore = value => typeof value === 'object' && value !== null && typeof value.owner === 'string' ? value : null

    assert.deepEqual(loadValue('perfun:user:bob:checkout-draft', null, { restore }), { owner: 'bob' })
    assert.deepEqual(loadValue('perfun:user:alice:checkout-draft', null, { restore }), { owner: 'alice' })
    assert.equal(loadValue('perfun:user:charlie:checkout-draft', null, { restore }), null)
  })
})

test('local storage removes invalid values and migrates a valid legacy value once', () => {
  withStorage('localStorage', storage => {
    const restore = value => Array.isArray(value) ? value : null
    storage.setItem('perfun:user:alice:checkout-draft', '{not json')
    assert.deepEqual(loadValue('perfun:user:alice:checkout-draft', [], { restore }), [])
    assert.equal(storage.getItem('perfun:user:alice:checkout-draft'), null)

    storage.setItem('perfun:guest:bag', JSON.stringify(['saved-item']))
    assert.deepEqual(loadValue('perfun:user:alice:bag', [], { restore, migrateFromKeys: ['perfun:guest:bag'] }), ['saved-item'])
    assert.equal(storage.getItem('perfun:guest:bag'), null)
    assert.equal(storage.getItem('perfun:user:alice:bag'), JSON.stringify(['saved-item']))
  })
})

test('direct checkout recovery accepts only valid serialized intents', () => {
  assert.deepEqual(readPendingCheckout(JSON.stringify(directItems), noteGroups), directItems)
  assert.equal(readPendingCheckout(JSON.stringify([{ ...directItems[0], formulas: [] }]), noteGroups), null)
  assert.equal(readPendingCheckout('{not json', noteGroups), null)
})

test('shipping-disabled pending checkout accepts only an explicit null quote', () => {
  const pending = { addressId: 'address', items: directItems, shippingQuoteId: null, requestId: 'request', token: 'token' }
  assert.equal(isCheckoutPending(pending), true)
  assert.equal(isCheckoutPending({ ...pending, shippingQuoteId: '' }), false)
})

test('bag checkout drafts retain only valid selected cart identities', () => {
  const draft = { userId: 'customer', source: 'bag', items: directItems, cartItemIds: ['blend-a', 'blend-b'] }
  assert.equal(isCheckoutDraft(draft), true)
  assert.equal(isCheckoutDraft({ ...draft, cartItemIds: ['blend-a', 4] }), false)
})

test('authentication errors retain the original error as their cause', () => {
  const original = new TypeError('network unavailable')
  const wrapped = errorWithCause('Unable to sign in.', original)
  assert.equal(wrapped.message, 'Unable to sign in.')
  assert.equal(wrapped.cause, original)
})

test('orders filters and detail remain local while note art uses canonical static assets', () => {
  const source = readFileSync(new URL('../src/pages/OrdersPage.tsx', import.meta.url), 'utf8')

  assert.match(source, /orders\.filter\(order => matches\(order, filter\)\)/)
  assert.match(source, /if \(!userId \|\| inflight\.current\) return inflight\.current/)
  assert.match(source, /if \(selected\) return <CustomerOrderDetail order=\{selected\}/)
  assert.match(source, /getNoteStickerAsset\(item\.note\)/)
  assert.match(source, /item\?\.note\.name \?\? 'Belum tersedia'/)
  assert.doesNotMatch(source, /setInterval|visibilitychange|window\.focus|\.channel\(/)
})

test('orders visual fixture is local-only and avoids the legacy Orders selectors', () => {
  const source = readFileSync(new URL('../src/pages/OrdersPage.tsx', import.meta.url), 'utf8')
  const fixture = readFileSync(new URL('../src/fixtures/ordersPreview.tsx', import.meta.url), 'utf8')

  assert.match(source, /customer-order-card/)
  assert.doesNotMatch(source, /className="order-card"|<footer>/)
  assert.match(source, /order\.discount > 0 \? <div><dt>Diskon peluncuran/)
  assert.match(source, /Pengiriman akan disiapkan setelah parfum selesai diracik/)
  assert.match(fixture, /CustomerOrderCard/)
  assert.doesNotMatch(fixture, /listOrders|requireSupabase|from\('\w+/)
})
