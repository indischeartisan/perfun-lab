import test from 'node:test'
import assert from 'node:assert/strict'
import { errorWithCause } from '../src/lib/errors.ts'
import { directCheckoutResumeKey, readPendingDirectCheckout } from '../src/lib/checkoutResume.ts'
import { loadValue } from '../src/hooks/useLocalStorage.ts'

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

test('direct checkout recovery restores only valid intents and clears invalid session data', () => {
  withStorage('sessionStorage', storage => {
    storage.setItem(directCheckoutResumeKey, JSON.stringify(directItems))
    assert.deepEqual(readPendingDirectCheckout(noteGroups), directItems)

    storage.setItem(directCheckoutResumeKey, JSON.stringify([{ ...directItems[0], formulas: [] }]))
    assert.equal(readPendingDirectCheckout(noteGroups), null)
    assert.equal(storage.getItem(directCheckoutResumeKey), null)
  })
})

test('authentication errors retain the original error as their cause', () => {
  const original = new TypeError('network unavailable')
  const wrapped = errorWithCause('Unable to sign in.', original)
  assert.equal(wrapped.message, 'Unable to sign in.')
  assert.equal(wrapped.cause, original)
})
