import { Lightbulb, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { loadExploreArticleDetail, type ExploreArticleDetail } from '../data/exploreArticleDetails'
import { getPublishedExploreContentById, type ExploreContentCategory } from '../data/exploreContent'
import { ExploreArticleCover } from './ExploreArticleCover'

const categoryLabels: Record<ExploreContentCategory, string> = {
  study: 'Lab Study',
  experiment: 'Eksperimen Lab',
  journal: 'Jurnal Lab',
  'new-note': 'Note Baru',
  seasonal: 'Momen Musiman'
}

export function ExploreQuickCard({ contentId, onClose, onMix }: { contentId: string; onClose: () => void; onMix: () => void }) {
  const content = getPublishedExploreContentById(contentId)
  const [detail, setDetail] = useState<ExploreArticleDetail | null>(null)
  const [loading, setLoading] = useState(Boolean(content))
  const dialog = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus.current?.focus()
    }
  }, [onClose])

  useEffect(() => {
    if (!content || content.destination.type !== 'quick') return
    let active = true
    void loadExploreArticleDetail(content.destination.contentId).then(value => {
      if (!active) return
      setDetail(value)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setDetail(null)
      setLoading(false)
    })
    return () => { active = false }
  }, [content])

  if (!content || content.destination.type !== 'quick') return null

  return <div className="explore-quick-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="explore-quick-card" role="dialog" aria-modal="true" aria-labelledby="explore-quick-title" tabIndex={-1} ref={dialog}>
      <button className="explore-quick-close" type="button" onClick={onClose} aria-label="Tutup bacaan singkat"><X aria-hidden="true"/></button>
      <p className="explore-quick-eyebrow">{categoryLabels[content.category]} · BACAAN SINGKAT</p>
      <h2 id="explore-quick-title">{content.title}</h2>
      <p className="explore-quick-summary">{content.summary}</p>
      <ExploreArticleCover src={content.coverImage}/>
      <div className="explore-quick-body" aria-live="polite">
        {loading ? <p role="status">Membuka bacaan singkat…</p> : detail?.blocks.filter(block => block.type === 'section').flatMap(block => block.paragraphs).map((paragraph, index) => <p key={index}>{paragraph}</p>) ?? <p>Bacaan singkat ini sementara tidak tersedia.</p>}
      </div>
      {detail?.labNote ? <aside className="explore-lab-note"><Lightbulb aria-hidden="true"/><div><strong>{detail.labNote.title}</strong><p>{detail.labNote.body}</p></div></aside> : null}
      {content.cta?.destination.type === 'mix' ? <button className="explore-quick-cta" type="button" onClick={onMix}>{content.cta.label}</button> : null}
    </div>
  </div>
}
