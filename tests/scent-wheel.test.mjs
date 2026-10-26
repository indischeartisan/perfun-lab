import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyWheelExplorationState, emptyWheelLayerSelection, familiesForPreset, isWheelLayerNoteDisabled, noteFamilyMetadata, resetWheelExploration, scentFamilies, selectedWheelNoteIds, surpriseFamilies, toggleWheelFamily, toggleWheelLayerSelection, toggleWheelSelection, unmappedWheelNoteIds, wheelNotesForLayer } from '../src/data/scentWheel.ts'

const baselineNoteIds = ['yuzu', 'berries', 'pink-pepper', 'mint', 'green-leaves', 'sea-breeze', 'soapy', 'peony', 'matcha', 'tea', 'coffee', 'jasmine', 'clean-musk', 'vanilla', 'sandalwood', 'amber', 'coconut-milk', 'honey']
const catalog = { noteGroups: { top: baselineNoteIds.map(id => ({ id })), middle: [], base: [] } }

test('Scent Wheel keeps the approved ten-family clockwise order and maps all baseline notes', () => {
  assert.deepEqual(scentFamilies, ['citrus', 'aquatic-clean', 'green', 'fruity', 'floral', 'gourmand', 'amber', 'woody', 'aromatic', 'spicy'])
  assert.deepEqual(Object.keys(noteFamilyMetadata).sort(), [...baselineNoteIds].sort())
  for (const metadata of Object.values(noteFamilyMetadata)) {
    assert.ok(scentFamilies.includes(metadata.primary))
    if (metadata.secondary) assert.ok(scentFamilies.includes(metadata.secondary))
  }
})

test('Scent Wheel presets retain the focus family and use approved ten-family relationships', () => {
  assert.deepEqual(familiesForPreset('citrus', 'family'), ['citrus'])
  assert.deepEqual(familiesForPreset('citrus', 'harmonious'), ['citrus', 'aquatic-clean', 'green', 'fruity'])
  assert.deepEqual(familiesForPreset('citrus', 'bold'), ['citrus', 'amber', 'woody'])
  assert.deepEqual(familiesForPreset('spicy', 'harmonious'), ['spicy', 'amber', 'woody', 'aromatic'])
})

test('Scent Wheel limits local exploratory selection to three unique notes', () => {
  let selected = []
  for (const id of ['yuzu', 'mint', 'matcha', 'amber']) selected = toggleWheelSelection(selected, id)
  assert.deepEqual(selected, ['yuzu', 'mint', 'matcha'])
  assert.deepEqual(toggleWheelSelection(selected, 'mint'), ['yuzu', 'matcha'])
})

test('manual family selection supports zero through ten unique families', () => {
  assert.deepEqual(toggleWheelFamily(['citrus'], 'citrus'), [])
  assert.deepEqual(toggleWheelFamily(['citrus'], 'floral'), ['citrus', 'floral'])
  assert.deepEqual(toggleWheelFamily(['citrus', 'floral'], 'citrus'), ['floral'])
  assert.deepEqual(scentFamilies.reduce((selected, family) => toggleWheelFamily(selected, family), []), [...scentFamilies])
})

test('surprise selection has one focus and two different active families when the catalog can support them', () => {
  const surprise = surpriseFamilies(catalog, () => 0)
  assert.equal(surprise.length, 3)
  assert.equal(new Set(surprise).size, 3)
})

test('unmapped active notes are reported safely and reset all clears both local selection types', () => {
  assert.deepEqual(unmappedWheelNoteIds({ noteGroups: { top: [{ id: 'unmapped-note' }], middle: [], base: [] } }), ['unmapped-note'])
  assert.deepEqual(resetWheelExploration(), { familyIds: [], selectedIds: [] })
})

const layeredCatalog = {
  noteGroups: {
    top: [{ id: 'yuzu' }, { id: 'soapy' }, { id: 'mint' }],
    middle: [{ id: 'matcha' }, { id: 'soapy' }, { id: 'peony' }],
    base: [{ id: 'clean-musk' }, { id: 'soapy' }, { id: 'amber' }],
  },
}

test('Wheel groups active catalog notes by Top, Middle, and Base without duplicate rows', () => {
  assert.deepEqual(wheelNotesForLayer(layeredCatalog, ['citrus', 'aquatic-clean', 'green', 'aromatic'], 'top').map(note => note.id), ['yuzu', 'soapy', 'mint'])
  assert.deepEqual(wheelNotesForLayer(layeredCatalog, ['citrus', 'aquatic-clean', 'green'], 'middle').map(note => note.id), ['matcha', 'soapy'])
  assert.deepEqual(wheelNotesForLayer(layeredCatalog, ['citrus', 'aquatic-clean', 'green'], 'base').map(note => note.id), ['clean-musk', 'soapy'])
})

test('Wheel enforces one note per layer, three unique notes, and releases a slot on cancellation', () => {
  let selection = emptyWheelLayerSelection()
  selection = toggleWheelLayerSelection(selection, 'top', 'yuzu')
  assert.deepEqual(selection, { top: 'yuzu', middle: null, base: null })
  assert.equal(isWheelLayerNoteDisabled(selection, 'top', 'mint'), true)
  selection = toggleWheelLayerSelection(selection, 'middle', 'matcha')
  selection = toggleWheelLayerSelection(selection, 'base', 'clean-musk')
  assert.deepEqual(selectedWheelNoteIds(selection), ['yuzu', 'matcha', 'clean-musk'])
  selection = toggleWheelLayerSelection(selection, 'middle', 'matcha')
  assert.deepEqual(selection, { top: 'yuzu', middle: null, base: 'clean-musk' })
  assert.equal(isWheelLayerNoteDisabled(selection, 'middle', 'peony'), false)
})

test('Soapy can occupy one valid Wheel layer only and becomes available again after cancellation', () => {
  let selection = toggleWheelLayerSelection(emptyWheelLayerSelection(), 'middle', 'soapy')
  assert.equal(isWheelLayerNoteDisabled(selection, 'top', 'soapy'), true)
  assert.equal(isWheelLayerNoteDisabled(selection, 'base', 'soapy'), true)
  assert.deepEqual(toggleWheelLayerSelection(selection, 'base', 'soapy'), selection)
  selection = toggleWheelLayerSelection(selection, 'middle', 'soapy')
  assert.equal(isWheelLayerNoteDisabled(selection, 'base', 'soapy'), false)
  assert.deepEqual(toggleWheelLayerSelection(selection, 'base', 'soapy'), { top: null, middle: null, base: 'soapy' })
})

test('Wheel session exploration state starts empty and can retain a surprise result until explicitly reset', () => {
  const initial = emptyWheelExplorationState()
  assert.deepEqual(initial, { activeFamilyIds: [], activePreset: 'custom', focusedFamilyId: null })
  const surprise = surpriseFamilies(catalog, () => 0)
  const sessionState = { activeFamilyIds: surprise, activePreset: 'surprise', focusedFamilyId: surprise[0] }
  assert.deepEqual(sessionState.activeFamilyIds, surprise)
  assert.equal(sessionState.activePreset, 'surprise')
  assert.deepEqual(emptyWheelExplorationState(), initial)
})
