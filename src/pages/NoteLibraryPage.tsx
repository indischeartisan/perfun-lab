import { ArrowLeft, ArrowRight, BookOpen, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getNoteLibraryEntry } from '../data/noteLibraryContent'
import type { Catalog } from '../lib/catalog'
import { getLibraryNotes } from '../lib/noteLibrary'
import { getNoteStickerAsset } from '../lib/noteAssets'
type Filter = 'all' | 'top' | 'middle' | 'base'

const filterLabels: Record<Filter, string> = { all: 'Semua', top: 'Top', middle: 'Middle', base: 'Base' }

export function NoteLibraryPage({ catalog, onBack, onOpenNote }: { catalog: Catalog; onBack: () => void; onOpenNote: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const notes = useMemo(() => getLibraryNotes(catalog), [catalog])
  const visible = filter === 'all' ? notes : notes.filter(item => item.layers.includes(filter))
  return <section className="note-library-page"><button className="explore-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> Kembali ke Explore</button><header className="note-library-header"><span>THE NOTE LIBRARY</span><h1>Kenali setiap note.</h1><p>Setiap aroma punya karakter kecilnya sendiri. Jelajahi sesukamu, lalu bawa rasa penasaranmu ke Mixing Table.</p></header><div className="note-library-filters" aria-label="Filter posisi note">{(Object.keys(filterLabels) as Filter[]).map(value => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{filterLabels[value]}</button>)}</div>{visible.length ? <div className="note-library-grid">{visible.map(({ note, layers }) => { const asset = getNoteStickerAsset(note); const content = getNoteLibraryEntry(note.id); return <button className="note-library-card" key={note.id} type="button" onClick={() => onOpenNote(note.id)}><div className="note-library-art" style={{ backgroundColor: note.stickerColor }} aria-hidden="true">{asset ? <img src={asset} alt="" loading="lazy"/> : <span>{note.icon ?? <Sparkles/>}</span>}</div><div><span>{layers.map(layer => layer[0].toUpperCase() + layer.slice(1)).join(' · ')}</span><h2>{note.name}</h2><p>{content?.family ?? note.category}</p><i aria-hidden="true"><ArrowRight/></i></div></button> })}</div> : <div className="note-library-empty"><BookOpen aria-hidden="true"/><h2>Belum ada note untuk ditampilkan.</h2><p>Katalog aktif sedang tidak menyediakan note pada posisi ini.</p></div>}</section>
}
