import test from 'node:test'
import assert from 'node:assert/strict'
import { noteLibraryContent, noteLibraryPairings } from '../src/data/noteLibraryContent.ts'

const catalogNoteIds = new Set(['yuzu', 'berries', 'pink-pepper', 'mint', 'green-leaves', 'sea-breeze', 'soapy', 'peony', 'matcha', 'tea', 'coffee', 'jasmine', 'clean-musk', 'vanilla', 'sandalwood', 'amber', 'coconut-milk', 'honey'])

test('Note Library pairing metadata only references known, distinct notes', () => {
  for (const [sourceId, groups] of Object.entries(noteLibraryPairings)) {
    assert.ok(catalogNoteIds.has(sourceId))
    assert.ok(noteLibraryContent[sourceId])
    for (const group of Object.values(groups)) {
      assert.equal(new Set(group.ids).size, group.ids.length)
      assert.ok(group.ids.every(targetId => targetId !== sourceId && catalogNoteIds.has(targetId)))
    }
  }
})
