import { ArrowLeft, FlaskConical, Lightbulb } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadExploreArticleDetail, type ExploreArticleDetail } from '../data/exploreArticleDetails'
import { getPublishedExploreContentById, type ExploreContentCategory } from '../data/exploreContent'
import { ExploreArticleCover } from '../components/ExploreArticleCover'

const categoryLabels: Record<ExploreContentCategory, string> = {
  study: 'Lab Study',
  experiment: 'Lab Experiment',
  journal: 'Lab Journal',
  'new-note': 'New Notes',
  seasonal: 'Seasonal Event'
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
    <h1>That article is not in the Lab right now.</h1>
    <p>Explore the latest notes and stories from Perfun Lab.</p>
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
      {loading ? <p role="status">Opening the article…</p> : detail ? detail.blocks.map((block, index) => block.type === 'section' ? <section className="explore-article-section" key={`${detail.id}-${index}`}>{block.heading ? <h2>{block.heading}</h2> : null}{block.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</section> : block.type === 'image' ? <ExploreArticleCover key={`${detail.id}-${index}`} src={block.src} loading="lazy"/> : <aside className="explore-article-takeaways" key={`${detail.id}-${index}`}><h2>{block.heading}</h2><ul>{block.items.map(item => <li key={item}>{item}</li>)}</ul></aside>) : <p>This article is temporarily unavailable. Please return to Explore and try another story.</p>}
    </section>
    {detail?.labNote ? <aside className="explore-lab-note explore-article-note"><Lightbulb aria-hidden="true"/><div><strong>{detail.labNote.title}</strong><p>{detail.labNote.body}</p></div></aside> : null}
    {article.cta?.destination.type === 'mix' ? <button className="explore-article-cta" type="button" onClick={onMix}><FlaskConical aria-hidden="true"/>{article.cta.label}</button> : null}
  </article>
}
