import { ArrowLeft, ArrowRight } from 'lucide-react'
import { ExploreArticleCover } from '../components/ExploreArticleCover'
import { getFreshExploreContent, getStudyExploreContent, isNewFromStudy, type ExploreContentCategory, type ExploreContentItem } from '../data/exploreContent'
import type { ArticleOrigin } from '../app/workspaceRouting'

type CollectionKind = 'fresh' | 'study'

const categoryLabels: Record<ExploreContentCategory, string> = {
  study: 'Lab Study',
  experiment: 'Eksperimen Lab',
  journal: 'Jurnal Lab',
  'new-note': 'Note Baru',
  seasonal: 'Momen Musiman'
}

const collectionCopy: Record<CollectionKind, { eyebrow: string; title: string; description: string }> = {
  fresh: { eyebrow: 'YANG BARU DI LAB', title: 'Fresh From the Lab', description: 'Eksperimen kecil, catatan jurnal, dan hal baru untuk ditemukan di Lab.' },
  study: { eyebrow: 'DASAR-DASAR AROMA', title: 'Lab Study', description: 'Bacaan ringan untuk mengenal dunia aroma.' }
}

export function ExploreCollectionPage({ kind, onBack, onOpenArticle, onOpenQuick }: { kind: CollectionKind; onBack: () => void; onOpenArticle: (id: string, origin: ArticleOrigin) => void; onOpenQuick: (id: string) => void }) {
  const content = kind === 'fresh' ? getFreshExploreContent() : getStudyExploreContent()
  const copy = collectionCopy[kind]

  return <section className="explore-collection-page">
    <button className="explore-collection-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> Kembali ke Explore</button>
    <header className="explore-collection-header"><span>{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p></header>
    {content.length ? <div className="explore-collection-grid">{content.map(item => <CollectionCard key={item.id} item={item} newFromStudy={kind === 'fresh' && isNewFromStudy(item)} onOpenArticle={onOpenArticle} onOpenQuick={onOpenQuick}/>)}</div> : <p className="explore-collection-empty">Belum ada yang diterbitkan di sini. Kunjungi Explore lagi nanti.</p>}
  </section>
}

function CollectionCard({ item, newFromStudy, onOpenArticle, onOpenQuick }: { item: ExploreContentItem; newFromStudy: boolean; onOpenArticle: (id: string, origin: ArticleOrigin) => void; onOpenQuick: (id: string) => void }) {
  const open = () => {
    if (item.destination.type === 'article') onOpenArticle(item.destination.contentId, newFromStudy || item.category !== 'study' ? 'fresh' : 'study')
    if (item.destination.type === 'quick') onOpenQuick(item.destination.contentId)
  }
  const label = newFromStudy ? 'Baru dari Study' : categoryLabels[item.category]
  const interactive = item.destination.type === 'article' || item.destination.type === 'quick'
  return <article className="explore-collection-card">
    <ExploreArticleCover src={item.coverImage} loading="lazy"/>
    <div className="explore-collection-card-copy"><span>{label}</span><h2>{item.title}</h2><p>{item.summary}</p>{interactive ? <button type="button" onClick={open}>{item.format === 'quick' ? 'Buka bacaan singkat' : 'Baca artikel'} <ArrowRight aria-hidden="true"/></button> : null}</div>
  </article>
}
