import { ArrowLeft, ArrowRight } from 'lucide-react'
import { ExploreArticleCover } from '../components/ExploreArticleCover'
import { getFreshExploreContent, getStudyExploreContent, isNewFromStudy, type ExploreContentCategory, type ExploreContentItem } from '../data/exploreContent'
import type { ArticleOrigin } from '../app/workspaceRouting'

type CollectionKind = 'fresh' | 'study'

const categoryLabels: Record<ExploreContentCategory, string> = {
  study: 'Lab Study',
  experiment: 'Lab Experiment',
  journal: 'Lab Journal',
  'new-note': 'New Notes',
  seasonal: 'Seasonal Event'
}

const collectionCopy: Record<CollectionKind, { eyebrow: string; title: string; description: string }> = {
  fresh: { eyebrow: 'WHAT IS HAPPENING', title: 'Fresh From the Lab', description: 'Little experiments, journal notes, and new things to discover in the Lab.' },
  study: { eyebrow: 'SCENT BASICS', title: 'Lab Study', description: 'Short, friendly reads for getting to know the world of scent.' }
}

export function ExploreCollectionPage({ kind, onBack, onOpenArticle, onOpenQuick }: { kind: CollectionKind; onBack: () => void; onOpenArticle: (id: string, origin: ArticleOrigin) => void; onOpenQuick: (id: string) => void }) {
  const content = kind === 'fresh' ? getFreshExploreContent() : getStudyExploreContent()
  const copy = collectionCopy[kind]

  return <section className="explore-collection-page">
    <button className="explore-collection-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> Back to Explore</button>
    <header className="explore-collection-header"><span>{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p></header>
    {content.length ? <div className="explore-collection-grid">{content.map(item => <CollectionCard key={item.id} item={item} newFromStudy={kind === 'fresh' && isNewFromStudy(item)} onOpenArticle={onOpenArticle} onOpenQuick={onOpenQuick}/>)}</div> : <p className="explore-collection-empty">There is nothing published here just yet. Please visit Explore again soon.</p>}
  </section>
}

function CollectionCard({ item, newFromStudy, onOpenArticle, onOpenQuick }: { item: ExploreContentItem; newFromStudy: boolean; onOpenArticle: (id: string, origin: ArticleOrigin) => void; onOpenQuick: (id: string) => void }) {
  const open = () => {
    if (item.destination.type === 'article') onOpenArticle(item.destination.contentId, newFromStudy || item.category !== 'study' ? 'fresh' : 'study')
    if (item.destination.type === 'quick') onOpenQuick(item.destination.contentId)
  }
  const label = newFromStudy ? 'New from Study' : categoryLabels[item.category]
  const interactive = item.destination.type === 'article' || item.destination.type === 'quick'
  return <article className="explore-collection-card">
    <ExploreArticleCover src={item.coverImage} loading="lazy"/>
    <div className="explore-collection-card-copy"><span>{label}</span><h2>{item.title}</h2><p>{item.summary}</p>{interactive ? <button type="button" onClick={open}>{item.format === 'quick' ? 'Open quick read' : 'Read article'} <ArrowRight aria-hidden="true"/></button> : null}</div>
  </article>
}
