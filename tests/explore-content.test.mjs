import test from 'node:test'
import assert from 'node:assert/strict'
import { exploreContent, getFeaturedExploreContent, getFreshExploreContent, getPublishedExploreContent, getStudyExploreContent, isNewFromStudy } from '../src/data/exploreContent.ts'
import { loadExploreArticleDetail } from '../src/data/exploreArticleDetails.ts'
import { readFile } from 'node:fs/promises'

test('featured Explore content is published and uses valid destinations', () => {
  const contentIds = new Set(exploreContent.map(item => item.id))
  for (const item of getFeaturedExploreContent()) {
    assert.equal(item.status, 'published')
    assert.equal(item.featured, true)
    assert.ok(item.destination.type === 'none' || item.destination.type === 'mix' || contentIds.has(item.destination.contentId))
  }
})

test('unpublished content cannot appear in the published Explore collection', () => {
  assert.ok(getPublishedExploreContent().every(item => item.status === 'published'))
})

test('published content declares a supported format and draft content is not featured', () => {
  const formats = new Set(['quick', 'short', 'deep'])
  for (const item of exploreContent) {
    assert.ok(formats.has(item.format))
    if (item.status === 'draft') assert.equal(item.featured, false)
  }
})

test('article detail loader safely rejects unsupported content', async () => {
  assert.equal((await loadExploreArticleDetail('missing-article')), null)
})

test('minimum launch publishes exactly five Indonesian articles and drafts every legacy placeholder', () => {
  const now = new Date('2026-11-13T12:00:00Z')
  const published = getPublishedExploreContent(undefined, now)
  assert.equal(published.length, 5)
  assert.deepEqual(published.map(item => item.id).sort(), [
    'experiment-growing-combinations',
    'journal-welcome-to-perfun-lab',
    'quick-fresh-is-not-always-citrus',
    'study-fragrance-family',
    'study-top-middle-base-notes'
  ])
  assert.ok(exploreContent.filter(item => item.id.startsWith('legacy-')).every(item => item.status === 'draft'))
  assert.ok(published.every(item => /[A-Za-zÀ-ÿ]/.test(item.title) && /[A-Za-zÀ-ÿ]/.test(item.summary)))
})

test('Fresh includes the three editorial items and only the newest eligible Study item', () => {
  const now = new Date('2026-11-13T12:00:00Z')
  const fresh = getFreshExploreContent(now)
  const study = getStudyExploreContent(now)
  assert.equal(fresh.length, 4)
  assert.equal(fresh.filter(item => item.category !== 'study').length, 3)
  assert.equal(fresh.filter(item => item.category === 'study').length, 1)
  assert.equal(fresh.find(item => item.category === 'study')?.id, 'study-fragrance-family')
  assert.equal(fresh.find(item => item.category === 'study')?.id, study[0]?.id)
  assert.equal(isNewFromStudy(study[0], now), true)
  assert.ok(fresh.every(item => item.category === 'study' || item.featured))
})

test('draft and future-dated content stays out of published Study and Fresh selectors', () => {
  const now = new Date('2026-11-13T12:00:00Z')
  const studyTemplate = exploreContent.find(item => item.id === 'study-top-middle-base-notes')
  assert.ok(studyTemplate)
  const fixture = [
    { ...studyTemplate, id: 'study-tie-b', publishedAt: '2026-11-10' },
    { ...studyTemplate, id: 'study-tie-a', publishedAt: '2026-11-10' },
    { ...studyTemplate, id: 'future-study', publishedAt: '2026-12-01' },
    { ...exploreContent.at(-1), id: 'draft-study', category: 'study', publishedAt: '2026-10-21' }
  ]
  assert.deepEqual(getStudyExploreContent(now, fixture).map(item => item.id), ['study-tie-a', 'study-tie-b'])
  assert.deepEqual(getFreshExploreContent(now, fixture).map(item => item.id), ['study-tie-a'])
})

test('each published article has a complete detail module and Little Lab Note', async () => {
  const now = new Date('2026-11-13T12:00:00Z')
  const moduleById = {
    'journal-welcome-to-perfun-lab': 'journalWelcomeToPerfunLab.ts',
    'experiment-growing-combinations': 'experimentGrowingCombinations.ts',
    'quick-fresh-is-not-always-citrus': 'quickFreshIsNotAlwaysCitrus.ts',
    'study-top-middle-base-notes': 'studyTopMiddleBaseNotes.ts',
    'study-fragrance-family': 'studyFragranceFamily.ts'
  }
  for (const item of getPublishedExploreContent(undefined, now)) {
    assert.notEqual(item.destination.type, 'none')
    const detailSource = await readFile(new URL(`../src/data/explore-details/${moduleById[item.id]}`, import.meta.url), 'utf8')
    assert.match(detailSource, /blocks: \[/)
    assert.match(detailSource, /labNote: \{ title: 'Little Lab Note', body: '.+'/)
  }
})

test('Explore homepage renders only the Note Library gateway, not legacy note preview cards', async () => {
  const source = await readFile(new URL('../src/pages/ExploreHomePage.tsx', import.meta.url), 'utf8')
  assert.equal((source.match(/<h2 id="explore-note-library-title">Note Library<\/h2>/g) ?? []).length, 1)
  assert.doesNotMatch(source, /explore-note-fallback|featured\.map\(note/)
})
