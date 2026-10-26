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
  'quick-what-is-a-top-note': () => import('./explore-details/quickWhatIsATopNote'),
  'study-why-citrus-smells-fresh': () => import('./explore-details/studyWhyCitrusSmellsFresh'),
  'study-top-middle-base-notes': () => import('./explore-details/studyTopMiddleBaseNotes'),
  'study-top-notes': () => import('./explore-details/studyTopNotes'),
  'study-middle-notes': () => import('./explore-details/studyMiddleNotes'),
  'study-base-notes': () => import('./explore-details/studyBaseNotes'),
  'experiment-three-layers': () => import('./explore-details/experimentThreeLayers'),
  'journal-curious-noses': () => import('./explore-details/journalCuriousNoses')
} as const

export type ExploreArticleId = keyof typeof articleLoaders

export async function loadExploreArticleDetail(id: string): Promise<ExploreArticleDetail | null> {
  const loader = articleLoaders[id as ExploreArticleId]
  if (!loader) return null
  return (await loader()).article
}
