import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileCartSelection, remapSelectedCartItem, removeSelectedCartItems } from '../src/lib/cartSelection.ts'
import { shouldAutoSelectAddress } from '../src/lib/addressBookMode.ts'
import { addressEditorFocusKey } from '../src/lib/addressEditorFocus.ts'
import { shippingErrorMessage } from '../src/lib/shippingMessages.ts'
import { globalLoadingMessage } from '../src/lib/loadingCopy.ts'
import { createAuthProfileRequestGuard, preservesAuthenticatedProfile } from '../src/lib/authSessionState.ts'

test('address management mode does not auto-select a saved address', () => {
  assert.equal(shouldAutoSelectAddress('manage'), false)
  assert.equal(shouldAutoSelectAddress('select'), true)
})

test('address editor initial focus lifecycle is stable while form values change', () => {
  const opened = { id: 'editor-1' }
  const afterTyping = { id: 'editor-1' }
  assert.equal(addressEditorFocusKey(opened), 'editor-1')
  assert.equal(addressEditorFocusKey(afterTyping), addressEditorFocusKey(opened))
  assert.equal(addressEditorFocusKey(null), null)
})

test('shipping lookup failures use clear Indonesian recovery copy', () => {
  assert.match(shippingErrorMessage(new Error('Failed to send a request to the Edge Function')), /Tidak dapat terhubung/)
  assert.match(shippingErrorMessage(new Error('Shipping is not configured yet. Please try again later.')), /perlu diperbarui terlebih dahulu/)
  assert.match(shippingErrorMessage(new Error('No shipping service is available for this route.')), /belum tersedia/)
})

test('global loading uses the approved Indonesian copy', () => {
  assert.equal(globalLoadingMessage, 'Menyiapkan ruangmu…')
})

test('TOKEN_REFRESHED dan SIGNED_IN akun yang sama mempertahankan profil terverifikasi', () => {
  assert.equal(preservesAuthenticatedProfile('customer-a', 'customer-a'), true)
  assert.equal(preservesAuthenticatedProfile('customer-a', 'customer-b'), false)
  assert.equal(preservesAuthenticatedProfile('customer-a', null), false)
})

test('respons profil akun lama diabaikan setelah pergantian akun', () => {
  const guard = createAuthProfileRequestGuard()
  const oldRequest = guard.begin('customer-a')
  guard.switchTo('admin-b')
  assert.equal(guard.accepts(oldRequest, 'customer-a'), false)
  const newRequest = guard.begin('admin-b')
  assert.equal(guard.accepts(newRequest, 'admin-b'), true)
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
