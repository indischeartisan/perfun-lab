import test from 'node:test'
import assert from 'node:assert/strict'
import { nextHeaderVisibility } from '../src/lib/headerVisibility.ts'

test('customer header hides only after a meaningful downward scroll and shows on upward movement', () => {
  const start = { hidden: false, lastScrollY: 0 }
  assert.equal(nextHeaderVisibility(start, 8), start)
  const hidden = nextHeaderVisibility(start, 120)
  assert.deepEqual(hidden, { hidden: true, lastScrollY: 120 })
  const stillHidden = nextHeaderVisibility(hidden, 126)
  assert.equal(stillHidden, hidden)
  assert.deepEqual(nextHeaderVisibility(hidden, 100), { hidden: false, lastScrollY: 100 })
})

test('customer header always shows again at the top of the page', () => {
  assert.deepEqual(nextHeaderVisibility({ hidden: true, lastScrollY: 220 }, 0), { hidden: false, lastScrollY: 0 })
})
