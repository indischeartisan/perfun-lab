export type ExploreContentCategory = 'study' | 'experiment' | 'journal' | 'new-note' | 'seasonal'
export type ExploreContentStatus = 'draft' | 'published'
export type ExploreContentFormat = 'quick' | 'short' | 'deep'

export type ExploreContentDestination =
  | { type: 'article'; contentId: string }
  | { type: 'quick'; contentId: string }
  | { type: 'mix' }
  | { type: 'none' }

export interface ExploreContentCta {
  label: string
  destination: Extract<ExploreContentDestination, { type: 'mix' }>
}

export interface ExploreContentItem {
  id: string
  category: ExploreContentCategory
  format: ExploreContentFormat
  status: ExploreContentStatus
  featured: boolean
  title: string
  summary: string
  publishedAt?: string
  coverImage: string | null
  destination: ExploreContentDestination
  cta?: ExploreContentCta
}

export const exploreContent: readonly ExploreContentItem[] = [
  { id: 'quick-what-is-a-top-note', category: 'study', format: 'quick', status: 'published', featured: true, title: 'What is a top note?', summary: 'The first hello of a scent.', publishedAt: '2026-10-01', coverImage: '/stickers/yuzu.webp', destination: { type: 'quick', contentId: 'quick-what-is-a-top-note' } },
  { id: 'study-why-citrus-smells-fresh', category: 'study', format: 'short', status: 'published', featured: true, title: 'Why does citrus smell fresh?', summary: 'A little scent science behind a bright first impression.', publishedAt: '2026-10-14', coverImage: '/stickers/yuzu.webp', destination: { type: 'article', contentId: 'study-why-citrus-smells-fresh' } },
  { id: 'study-top-middle-base-notes', category: 'study', format: 'deep', status: 'published', featured: true, title: 'Top, Middle & Base Notes', summary: 'How a scent unfolds over time.', publishedAt: '2026-10-18', coverImage: '/stickers/matcha.webp', destination: { type: 'article', contentId: 'study-top-middle-base-notes' }, cta: { label: 'Try it in the Lab', destination: { type: 'mix' } } },
  { id: 'study-top-notes', category: 'study', format: 'short', status: 'published', featured: false, title: 'Top notes', summary: 'The first impression of a scent.', publishedAt: '2026-09-01', coverImage: '/stickers/yuzu.webp', destination: { type: 'article', contentId: 'study-top-notes' } },
  { id: 'study-middle-notes', category: 'study', format: 'short', status: 'published', featured: false, title: 'Middle notes', summary: 'The main character of a scent.', publishedAt: '2026-09-03', coverImage: '/stickers/jasmine.webp', destination: { type: 'article', contentId: 'study-middle-notes' } },
  { id: 'study-base-notes', category: 'study', format: 'short', status: 'published', featured: false, title: 'Base notes', summary: 'What stays close to skin.', publishedAt: '2026-09-05', coverImage: '/stickers/clean-musk.webp', destination: { type: 'article', contentId: 'study-base-notes' } },
  { id: 'experiment-three-layers', category: 'experiment', format: 'quick', status: 'published', featured: true, title: 'Three layers, one starting point', summary: 'Meet the three layers that make a Perfun Lab mix.', publishedAt: '2026-10-07', coverImage: '/stickers/matcha.webp', destination: { type: 'quick', contentId: 'experiment-three-layers' }, cta: { label: 'Start Mixing', destination: { type: 'mix' } } },
  { id: 'journal-curious-noses', category: 'journal', format: 'short', status: 'published', featured: true, title: 'A playground for curious noses', summary: 'A small introduction to exploring scent without rules.', publishedAt: '2026-10-04', coverImage: '/stickers/mint.webp', destination: { type: 'article', contentId: 'journal-curious-noses' } },
  { id: 'seasonal-lab-draft', category: 'seasonal', format: 'quick', status: 'draft', featured: false, title: 'A future Lab moment', summary: 'Not published.', coverImage: null, destination: { type: 'none' } }
]

function publicationTime(item: ExploreContentItem) {
  return item.publishedAt ? Date.parse(`${item.publishedAt}T23:59:59.999Z`) : 0
}

export function isPublishedExploreContent(item: ExploreContentItem, now = new Date()) {
  return item.status === 'published' && (!item.publishedAt || publicationTime(item) <= now.getTime())
}

export function sortExploreContentNewest(items: readonly ExploreContentItem[]) {
  return [...items].sort((left, right) => publicationTime(right) - publicationTime(left) || left.id.localeCompare(right.id))
}

export function getPublishedExploreContent(category?: ExploreContentCategory, now = new Date(), content: readonly ExploreContentItem[] = exploreContent) {
  return content.filter(item => isPublishedExploreContent(item, now) && (!category || item.category === category))
}

export function getPublishedExploreContentById(id: string, now = new Date()) {
  return getPublishedExploreContent(undefined, now).find(item => item.id === id) ?? null
}

export function getStudyExploreContent(now = new Date(), content: readonly ExploreContentItem[] = exploreContent) {
  return sortExploreContentNewest(getPublishedExploreContent('study', now, content))
}

export function getFreshExploreContent(now = new Date(), content: readonly ExploreContentItem[] = exploreContent) {
  const editorial = getPublishedExploreContent(undefined, now, content).filter(item => item.category !== 'study' && item.featured)
  const latestStudy = getStudyExploreContent(now, content).at(0)
  return sortExploreContentNewest(latestStudy ? [...editorial, latestStudy] : editorial)
}

export function isNewFromStudy(item: ExploreContentItem, now = new Date(), content: readonly ExploreContentItem[] = exploreContent) {
  return getStudyExploreContent(now, content).at(0)?.id === item.id
}

export function getFeaturedExploreContent(now = new Date()) {
  return getFreshExploreContent(now)
}
