import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWheelTransfer } from '../src/lib/wheelTransfer.ts'

const catalog = {
  noteGroups: {
    top: [{ id: 'yuzu' }, { id: 'soapy' }],
    middle: [{ id: 'matcha' }, { id: 'soapy' }, { id: 'yuzu' }],
    base: [{ id: 'clean-musk' }, { id: 'soapy' }],
  },
}

test('Wheel transfer resolves one, two, and three valid layer IDs without filling empty slots', () => {
  const one = resolveWheelTransfer({ topNoteId: 'yuzu', middleNoteId: null, baseNoteId: null }, catalog)
  assert.equal(one.selection.top?.id, 'yuzu')
  assert.equal(one.selection.middle, null)
  assert.equal(one.selection.base, null)

  const two = resolveWheelTransfer({ topNoteId: 'yuzu', middleNoteId: 'matcha', baseNoteId: null }, catalog)
  assert.deepEqual([two.selection.top?.id, two.selection.middle?.id, two.selection.base], ['yuzu', 'matcha', null])

  const three = resolveWheelTransfer({ topNoteId: 'yuzu', middleNoteId: 'matcha', baseNoteId: 'clean-musk' }, catalog)
  assert.deepEqual([three.selection.top?.id, three.selection.middle?.id, three.selection.base?.id], ['yuzu', 'matcha', 'clean-musk'])
  assert.equal(three.issues.length, 0)
})

test('Wheel transfer rejects duplicate IDs and Soapy in multiple layers without applying either duplicate', () => {
  const duplicate = resolveWheelTransfer({ topNoteId: 'yuzu', middleNoteId: 'yuzu', baseNoteId: null }, catalog)
  assert.deepEqual(duplicate.selection, { top: null, middle: null, base: null })
  assert.deepEqual(duplicate.issues.map(issue => issue.reason), ['duplicate', 'duplicate'])

  const soapy = resolveWheelTransfer({ topNoteId: 'soapy', middleNoteId: 'soapy', baseNoteId: null }, catalog)
  assert.deepEqual(soapy.selection, { top: null, middle: null, base: null })
  assert.deepEqual(soapy.issues.map(issue => issue.reason), ['soapy-conflict', 'soapy-conflict'])
})

test('Wheel transfer reports unavailable and wrong-layer IDs while retaining explicitly continued valid notes', () => {
  const resolution = resolveWheelTransfer({ topNoteId: 'yuzu', middleNoteId: 'clean-musk', baseNoteId: 'missing-note' }, catalog)
  assert.equal(resolution.selection.top?.id, 'yuzu')
  assert.equal(resolution.selection.middle, null)
  assert.equal(resolution.selection.base, null)
  assert.equal(resolution.hasAvailableNotes, true)
  assert.deepEqual(resolution.issues.map(issue => issue.reason), ['wrong-layer', 'unavailable'])
})
