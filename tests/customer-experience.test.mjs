import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileCartSelection, remapSelectedCartItem, removeSelectedCartItems } from '../src/lib/cartSelection.ts'
import { shouldAutoSelectAddress } from '../src/lib/addressBookMode.ts'

test('address management mode does not auto-select a saved address', () => {
  assert.equal(shouldAutoSelectAddress('manage'), false)
  assert.equal(shouldAutoSelectAddress('select'), true)
})

test('cart selection defaults to all current items and persists only valid IDs', () => {
  assert.deepEqual(reconcileCartSelection(['a', 'b'], { initialized: false, ids: [] }), { initialized: true, ids: ['a', 'b'] })
  assert.deepEqual(reconcileCartSelection(['a', 'b'], { initialized: true, ids: ['b', 'removed'] }), { initialized: true, ids: ['b'] })
})

test('selected cart item follows a size identity change', () => {
  assert.deepEqual(remapSelectedCartItem({ initialized: true, ids: ['ten', 'other'] }, 'ten', 'thirty'), { initialized: true, ids: ['other', 'thirty'] })
  assert.deepEqual(remapSelectedCartItem({ initialized: true, ids: ['other'] }, 'ten', 'thirty'), { initialized: true, ids: ['other'] })
})

test('successful checkout can remove only selected cart items', () => {
  const remaining = removeSelectedCartItems([{ id: 'selected' }, { id: 'unselected' }], ['selected'])
  assert.deepEqual(remaining, [{ id: 'unselected' }])
})
