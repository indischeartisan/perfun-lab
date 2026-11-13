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
  { id: 'journal-welcome-to-perfun-lab', category: 'journal', format: 'short', status: 'published', featured: true, title: 'Selamat Datang di Perfun Lab!', summary: 'Ruang bermain untuk mengikuti rasa ingin tahu, satu aroma dalam satu waktu.', publishedAt: '2026-11-09', coverImage: '/stickers/mint.webp', destination: { type: 'article', contentId: 'journal-welcome-to-perfun-lab' } },
  { id: 'experiment-growing-combinations', category: 'experiment', format: 'short', status: 'published', featured: true, title: 'Kombinasi Aroma yang Terus Bertambah', summary: 'Satu pilihan kecil bisa membuka banyak kemungkinan aroma.', publishedAt: '2026-11-10', coverImage: '/stickers/matcha.webp', destination: { type: 'article', contentId: 'experiment-growing-combinations' }, cta: { label: 'Mulai Meracik', destination: { type: 'mix' } } },
  { id: 'quick-fresh-is-not-always-citrus', category: 'experiment', format: 'quick', status: 'published', featured: true, title: 'Fresh Tidak Harus Citrus', summary: 'Rasa segar juga bisa hadir lewat daun, teh, dan udara setelah hujan.', publishedAt: '2026-11-11', coverImage: '/stickers/mint.webp', destination: { type: 'quick', contentId: 'quick-fresh-is-not-always-citrus' }, cta: { label: 'Coba di Lab', destination: { type: 'mix' } } },
  { id: 'study-top-middle-base-notes', category: 'study', format: 'deep', status: 'published', featured: true, title: 'Kenalan dengan Top, Middle & Base Notes', summary: 'Memahami tiga lapisan yang membuat sebuah aroma berubah seiring waktu.', publishedAt: '2026-11-08', coverImage: '/stickers/matcha.webp', destination: { type: 'article', contentId: 'study-top-middle-base-notes' }, cta: { label: 'Mulai Meracik', destination: { type: 'mix' } } },
  { id: 'study-fragrance-family', category: 'study', format: 'short', status: 'published', featured: true, title: 'Apa Itu Fragrance Family?', summary: 'Peta sederhana untuk mengenali arah karakter aroma yang kamu sukai.', publishedAt: '2026-11-12', coverImage: '/stickers/jasmine.webp', destination: { type: 'article', contentId: 'study-fragrance-family' } },
  { id: 'legacy-quick-what-is-a-top-note', category: 'study', format: 'quick', status: 'draft', featured: false, title: 'What is a top note?', summary: 'The first hello of a scent.', coverImage: '/stickers/yuzu.webp', destination: { type: 'none' } },
  { id: 'legacy-study-why-citrus-smells-fresh', category: 'study', format: 'short', status: 'draft', featured: false, title: 'Why does citrus smell fresh?', summary: 'A little scent science behind a bright first impression.', coverImage: '/stickers/yuzu.webp', destination: { type: 'none' } },
  { id: 'legacy-study-top-notes', category: 'study', format: 'short', status: 'draft', featured: false, title: 'Top notes', summary: 'The first impression of a scent.', coverImage: '/stickers/yuzu.webp', destination: { type: 'none' } },
  { id: 'legacy-study-middle-notes', category: 'study', format: 'short', status: 'draft', featured: false, title: 'Middle notes', summary: 'The main character of a scent.', coverImage: '/stickers/jasmine.webp', destination: { type: 'none' } },
  { id: 'legacy-study-base-notes', category: 'study', format: 'short', status: 'draft', featured: false, title: 'Base notes', summary: 'What stays close to skin.', coverImage: '/stickers/clean-musk.webp', destination: { type: 'none' } },
  { id: 'legacy-experiment-three-layers', category: 'experiment', format: 'quick', status: 'draft', featured: false, title: 'Three layers, one starting point', summary: 'Meet the three layers that make a Perfun Lab mix.', coverImage: '/stickers/matcha.webp', destination: { type: 'none' } },
  { id: 'legacy-journal-curious-noses', category: 'journal', format: 'short', status: 'draft', featured: false, title: 'A playground for curious noses', summary: 'A small introduction to exploring scent without rules.', coverImage: '/stickers/mint.webp', destination: { type: 'none' } }
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
