import { ArrowLeft, ArrowRight, BookOpen, FlaskConical, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getFreshExploreContent, type ExploreContentCategory } from '../data/exploreContent'
import type { Catalog } from '../lib/catalog'
import { getNoteStickerAsset } from '../lib/noteAssets'

const categoryLabels: Record<ExploreContentCategory, string> = {
  study: 'Lab Study',
  experiment: 'Lab Experiment',
  journal: 'Lab Journal',
  'new-note': 'New Notes',
  seasonal: 'Seasonal Event'
}

type ExploreHomePageProps = {
  catalog: Catalog
  onMix: () => void
  onOpenArticle: (id: string) => void
  onOpenQuick: (id: string) => void
  onViewFresh: () => void
  onViewStudy: () => void
  onViewLibrary: () => void
}

export function ExplorePage({ catalog, onMix, onOpenArticle, onOpenQuick, onViewFresh, onViewStudy, onViewLibrary }: ExploreHomePageProps) {
  const notes = Array.from(new Map(Object.values(catalog.noteGroups).flat().map(note => [note.id, note])).values())
  const wheelNotes = notes.filter(note => getNoteStickerAsset(note)).slice(0, 8)
  const studyNotes = notes.filter(note => getNoteStickerAsset(note)).slice(0, 3)
  const libraryNotes = notes.filter(note => getNoteStickerAsset(note)).slice(0, 3)
  const freshContent = getFreshExploreContent()
  const freshRail = useRef<HTMLDivElement>(null)
  const [freshControls, setFreshControls] = useState({ previous: false, next: false })

  function updateFreshControls() {
    const rail = freshRail.current
    if (!rail) return
    setFreshControls({ previous: rail.scrollLeft > 1, next: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1 })
  }

  useEffect(() => {
    updateFreshControls()
    window.addEventListener('resize', updateFreshControls)
    return () => window.removeEventListener('resize', updateFreshControls)
  }, [freshContent.length])

  function showNotes() {
    window.location.hash = '#wheel'
  }

  function moveFreshRail(direction: 1 | -1) {
    const rail = freshRail.current
    if (!rail) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    rail.scrollBy({ left: direction * Math.round(rail.clientWidth * .84), behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return <section className="explore-page">
    <header className="explore-intro"><span>YOUR PERFUME PLAYGROUND</span><h1>Explore the Lab<span>.</span></h1><p>Follow your curiosity, one note at a time.</p></header>

    <section className="explore-section explore-fresh-section" aria-labelledby="explore-fresh"><div className="explore-heading"><div><span>FRESH FROM THE LAB</span><h2 id="explore-fresh">Fresh From the Lab</h2></div><div className="explore-fresh-actions"><button className="explore-see-all" type="button" onClick={onViewFresh}>See all</button><div className="explore-fresh-controls" aria-label="Fresh From the Lab navigation"><button type="button" onClick={() => moveFreshRail(-1)} disabled={!freshControls.previous} aria-label="Previous story"><ArrowLeft aria-hidden="true"/></button><button type="button" onClick={() => moveFreshRail(1)} disabled={!freshControls.next} aria-label="Next story"><ArrowRight aria-hidden="true"/></button></div></div></div><div className="explore-fresh-rail" ref={freshRail} onScroll={updateFreshControls} role="region" aria-label="Fresh From the Lab stories">
      {freshContent.map((item, index) => { const note = notes[index % notes.length]; const fallbackAsset = note ? getNoteStickerAsset(note) : null; const articleId = item.destination.type === 'article' ? item.destination.contentId : null; const quickId = item.destination.type === 'quick' ? item.destination.contentId : null; return <article className={`explore-card explore-fresh-card explore-fresh-card--${item.category}`} key={item.id}><div className="explore-fresh-art" aria-hidden="true">{item.coverImage ? <img src={item.coverImage} alt="" loading={index === 0 ? 'eager' : 'lazy'}/> : fallbackAsset ? <img src={fallbackAsset} alt="" loading="lazy"/> : <Sparkles/>}</div><div className="explore-fresh-copy"><span>{categoryLabels[item.category]}</span><h3>{item.title}</h3>{articleId ? <button type="button" onClick={() => onOpenArticle(articleId)} aria-label={`Read ${item.title}`}><ArrowRight aria-hidden="true"/></button> : quickId ? <button type="button" onClick={() => onOpenQuick(quickId)} aria-label={`Open quick read: ${item.title}`}><ArrowRight aria-hidden="true"/></button> : null}</div></article> })}
    </div></section>

    <section className="explore-section" aria-labelledby="explore-discover"><div className="explore-heading"><div><span>DISCOVER YOUR SCENT</span><h2 id="explore-discover">Scent Wheel</h2></div></div><div className="explore-card explore-discover"><div className="explore-wheel" aria-label="Scent Wheel preview">{wheelNotes.map((note, index) => { const asset = getNoteStickerAsset(note); return asset ? <img key={note.id} src={asset} alt="" style={{ '--wheel-index': index } as CSSProperties}/> : null })}<strong>perfun<br/>lab.</strong></div><div className="explore-discover-copy"><p>Explore notes, families, and new combinations.</p><button onClick={showNotes}>Explore the Wheel <ArrowRight size={16}/></button></div></div></section>

    <div className="explore-gateway-grid">
      <section className="explore-section explore-study-section" aria-labelledby="explore-study"><div className="explore-heading"><div><span>LAB STUDY</span><h2 id="explore-study">Lab Study</h2></div><BookOpen aria-hidden="true"/></div><button className="explore-card explore-gateway-panel" type="button" onClick={onViewStudy}><div className="explore-study-art" aria-hidden="true">{studyNotes.map(note => { const asset = getNoteStickerAsset(note); return asset ? <img key={note.id} src={asset} alt=""/> : null })}</div><div><span>SCENT BASICS</span><h3>Small lessons for curious noses.</h3><p>Discover the building blocks behind every mix.</p><strong>Explore Lab Study <ArrowRight aria-hidden="true"/></strong></div></button></section>
      <section className="explore-section explore-library-gateway" id="explore-note-library-gateway" aria-labelledby="explore-note-library-title"><div className="explore-heading"><div><span>THE NOTE LIBRARY</span><h2 id="explore-note-library-title">Note Library</h2></div><BookOpen aria-hidden="true"/></div><button className="explore-card explore-gateway-panel" type="button" onClick={onViewLibrary}><div className="explore-library-art" aria-hidden="true">{libraryNotes.map(note => { const asset = getNoteStickerAsset(note); return asset ? <img key={note.id} src={asset} alt=""/> : null })}</div><div><span>GET TO KNOW THE NOTES</span><h3>Every note has a story.</h3><p>Browse the little characters that make a scent your own.</p><strong>Explore Note Library <ArrowRight aria-hidden="true"/></strong></div></button></section>
    </div>

    <section className="explore-start"><div><span>MAKE YOUR SCENT</span><h2>Make it yours.</h2></div><div className="explore-start-art" aria-hidden="true"><img src="/bottle/perfun-bottle.webp" alt=""/><Sparkles/></div><button onClick={onMix}><FlaskConical size={18}/> Start Mixing <ArrowRight size={18}/></button></section>
  </section>
}
