import test from 'node:test'
import assert from 'node:assert/strict'
import { articleHash, articleIdFromHash, articleOriginFromHash, navigationHash, noteHash, noteIdFromHash, viewFromHash, workspaceView } from '../src/app/workspaceRouting.ts'

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
  assert.equal(workspaceView('customer', 'admin'), 'explore')
  assert.equal(workspaceView('customer', 'production'), 'explore')
  assert.equal(workspaceView('customer', 'fulfillment'), 'explore')
  assert.equal(workspaceView('vendor', 'explore'), 'production')
  assert.equal(workspaceView('perfumer', 'explore'), 'production')
  assert.equal(workspaceView('admin', 'explore'), 'admin')
  assert.equal(workspaceView('perfumer', 'fulfillment'), 'production')
})

test('customer routes remain available only to customers and guests', () => {
  for (const view of ['explore', 'wheel', 'fresh', 'study', 'library', 'note', 'build', 'bag', 'checkout', 'confirmation', 'orders', 'more']) {
    assert.equal(workspaceView('customer', view), view)
    assert.equal(workspaceView(null, view), view)
  }
})

test('active Note Library links use a customer-only, encoded detail hash', () => {
  const hash = noteHash('pink-pepper')
  assert.equal(hash, '#note/pink-pepper')
  assert.equal(noteIdFromHash(hash), 'pink-pepper')
  assert.equal(viewFromHash(hash, false), 'note')
  assert.equal(workspaceView('customer', 'note'), 'note')
  assert.equal(workspaceView('vendor', 'note'), 'production')
  assert.equal(noteIdFromHash('#note/%'), null)
  assert.equal(viewFromHash('#note/%', false), 'explore')
})

test('customer default and direct links preserve Explore, Mix and checkout resume', () => {
  assert.equal(viewFromHash('', false), 'explore')
  assert.equal(viewFromHash('', true), 'bag')
  for (const view of ['explore', 'fresh', 'study', 'library', 'build', 'more', 'bag', 'orders', 'checkout']) {
    assert.equal(viewFromHash(`#${view}`, false), view)
    assert.equal(navigationHash(view, '/', ''), `#${view}`)
  }
})

test('published article hashes remain customer-only and preserve their content identifier', () => {
  const hash = articleHash('study-top-notes')
  assert.equal(hash, '#article/study-top-notes')
  assert.equal(articleIdFromHash(hash), 'study-top-notes')
  assert.equal(viewFromHash(hash, false), 'article')
  assert.equal(workspaceView('customer', 'article'), 'article')
  assert.equal(workspaceView('vendor', 'article'), 'production')
  assert.equal(articleIdFromHash('#article/%'), null)
  assert.equal(viewFromHash('#article/%', false), 'explore')
})

test('article hashes preserve only approved customer origins', () => {
  const freshHash = articleHash('study-top-middle-base-notes', 'fresh')
  assert.equal(freshHash, '#article/study-top-middle-base-notes?from=fresh')
  assert.equal(articleIdFromHash(freshHash), 'study-top-middle-base-notes')
  assert.equal(articleOriginFromHash(freshHash), 'fresh')
  assert.equal(articleOriginFromHash('#article/study-top-middle-base-notes?from=admin'), null)
  assert.equal(articleOriginFromHash('#article/study-top-middle-base-notes'), null)
})
