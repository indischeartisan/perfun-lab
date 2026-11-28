import type { ExploreContentItem } from './exploreContent'

export type ExploreArticleBlock =
  | { type: 'section'; heading?: string; paragraphs: readonly string[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'takeaways'; heading: string; items: readonly string[] }

export interface ExploreArticleDetail {
  id: ExploreContentItem['id']
  blocks: readonly ExploreArticleBlock[]
  labNote?: { title: string; body: string }
}

const articleLoaders = {
  'journal-welcome-to-perfun-lab': () => import('./explore-details/journalWelcomeToPerfunLab'),
  'experiment-growing-combinations': () => import('./explore-details/experimentGrowingCombinations'),
  'quick-fresh-is-not-always-citrus': () => import('./explore-details/quickFreshIsNotAlwaysCitrus'),
  'study-top-middle-base-notes': () => import('./explore-details/studyTopMiddleBaseNotes'),
  'study-fragrance-family': () => import('./explore-details/studyFragranceFamily')
} as const

export type ExploreArticleId = keyof typeof articleLoaders

export async function loadExploreArticleDetail(id: string): Promise<ExploreArticleDetail | null> {
  const loader = articleLoaders[id as ExploreArticleId]
  if (!loader) return null
  return (await loader()).article
}
