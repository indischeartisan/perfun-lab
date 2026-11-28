import { ArrowLeft, FlaskConical, Lightbulb } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadExploreArticleDetail, type ExploreArticleDetail } from '../data/exploreArticleDetails'
import { getPublishedExploreContentById, type ExploreContentCategory } from '../data/exploreContent'
import { ExploreArticleCover } from '../components/ExploreArticleCover'

const categoryLabels: Record<ExploreContentCategory, string> = {
  study: 'Lab Study',
  experiment: 'Eksperimen Lab',
  journal: 'Jurnal Lab',
  'new-note': 'Note Baru',
  seasonal: 'Momen Musiman'
}

export function ExploreArticlePage({ articleId, backLabel, onBack, onMix }: { articleId: string | null; backLabel: string; onBack: () => void; onMix: () => void }) {
  const article = articleId ? getPublishedExploreContentById(articleId) : null
  const detailId = article?.destination.type === 'article' ? article.destination.contentId : null
  const [detail, setDetail] = useState<ExploreArticleDetail | null>(null)
  const [loading, setLoading] = useState(Boolean(detailId))

  useEffect(() => {
    if (!detailId) return
    let active = true
    void loadExploreArticleDetail(detailId).then(value => {
      if (!active) return
      setDetail(value)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setDetail(null)
      setLoading(false)
    })
    return () => { active = false }
  }, [detailId])

  if (!article || article.destination.type !== 'article') return <section className="explore-article-page explore-article-page--missing">
    <button className="explore-article-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> {backLabel}</button>
    <p className="explore-article-eyebrow">THE LAB</p>
    <h1>Artikel ini belum ada di Lab saat ini.</h1>
    <p>Jelajahi catatan dan cerita terbaru dari Perfun Lab.</p>
  </section>

  return <article className="explore-article-page">
    <button className="explore-article-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> {backLabel}</button>
    <header className="explore-article-header">
      <p className="explore-article-eyebrow">{categoryLabels[article.category]}</p>
      <h1>{article.title}</h1>
      <p>{article.summary}</p>
    </header>
    <ExploreArticleCover src={article.coverImage}/>
    <section className="explore-article-body" aria-live="polite">
      {loading ? <p role="status">Membuka artikel…</p> : detail ? detail.blocks.map((block, index) => block.type === 'section' ? <section className="explore-article-section" key={`${detail.id}-${index}`}>{block.heading ? <h2>{block.heading}</h2> : null}{block.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</section> : block.type === 'image' ? <ExploreArticleCover key={`${detail.id}-${index}`} src={block.src} loading="lazy"/> : <aside className="explore-article-takeaways" key={`${detail.id}-${index}`}><h2>{block.heading}</h2><ul>{block.items.map(item => <li key={item}>{item}</li>)}</ul></aside>) : <p>Artikel ini sementara tidak tersedia. Kembali ke Explore dan coba cerita lain.</p>}
    </section>
    {detail?.labNote ? <aside className="explore-lab-note explore-article-note"><Lightbulb aria-hidden="true"/><div><strong>{detail.labNote.title}</strong><p>{detail.labNote.body}</p></div></aside> : null}
    {article.cta?.destination.type === 'mix' ? <button className="explore-article-cta" type="button" onClick={onMix}><FlaskConical aria-hidden="true"/>{article.cta.label}</button> : null}
  </article>
}
