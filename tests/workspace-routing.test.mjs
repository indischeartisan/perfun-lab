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

test('vendor workspace rejects customer and admin routes without broadening access', () => {
  assert.equal(workspaceView('vendor', 'admin'), 'production')
  assert.equal(workspaceView('vendor', 'checkout'), 'production')
  assert.equal(workspaceView('admin', 'admin'), 'admin')
})
