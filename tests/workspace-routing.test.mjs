import test from 'node:test'
import assert from 'node:assert/strict'
import { navigationHash, viewFromHash, workspaceView } from '../src/app/workspaceRouting.ts'

test('vendor workspace preserves production, fulfillment, and payments routes', () => {
  for (const view of ['production', 'fulfillment', 'payouts']) {
    assert.equal(workspaceView('vendor', view), view)
    assert.equal(viewFromHash(`#${view}`, false), view)
    assert.equal(navigationHash(view, '/', ''), `#${view}`)
  }
})

test('staff workspaces reject customer and cross-role routes without broadening access', () => {
  assert.equal(workspaceView('vendor', 'admin'), 'production')
  assert.equal(workspaceView('vendor', 'checkout'), 'production')
  assert.equal(workspaceView('admin', 'admin'), 'admin')
  assert.equal(workspaceView('admin', 'production'), 'admin')
  assert.equal(workspaceView('admin', 'build'), 'admin')
  assert.equal(workspaceView('customer', 'admin'), 'build')
  assert.equal(workspaceView('customer', 'production'), 'build')
  assert.equal(workspaceView('customer', 'fulfillment'), 'build')
  assert.equal(workspaceView('perfumer', 'fulfillment'), 'production')
})

test('customer routes remain available only to customers and guests', () => {
  for (const view of ['build', 'bag', 'checkout', 'confirmation', 'orders', 'more']) {
    assert.equal(workspaceView('customer', view), view)
    assert.equal(workspaceView(null, view), view)
  }
})
