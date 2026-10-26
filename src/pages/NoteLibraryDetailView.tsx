import { ArrowLeft, BookOpen, Sparkles } from 'lucide-react'
import { getNoteLibraryEntry, getNotePairings, type NotePairingKind } from '../data/noteLibraryContent'
import type { Catalog } from '../lib/catalog'
import { getLibraryNotes } from '../lib/noteLibrary'
import { getNoteStickerAsset } from '../lib/noteAssets'

const pairingLabels: Record<NotePairingKind, string> = { harmonious: 'Cocok Dipadukan Dengan', unique: 'Kombinasi Unik', bold: 'Berani Coba?' }

export function NoteLibraryDetailPage({ catalog, noteId, onBack, onOpenNote }: { catalog: Catalog; noteId: string | null; onBack: () => void; onOpenNote: (id: string) => void }) {
  const notes = getLibraryNotes(catalog)
  const item = notes.find(candidate => candidate.note.id === noteId)
  if (!item) return <section className="note-library-page note-library-missing"><button className="explore-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> Kembali ke Note Library</button><BookOpen aria-hidden="true"/><h1>Note tidak ditemukan.</h1><p>Note ini tidak tersedia di katalog aktif saat ini.</p></section>
  const { note, layers } = item
  const entry = getNoteLibraryEntry(note.id)
  const asset = getNoteStickerAsset(note)
  const pairings = getNotePairings(note.id)
  return <article className="note-detail-page"><button className="explore-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> Kembali ke Note Library</button><header><div className="note-detail-art" style={{ backgroundColor: note.stickerColor }} aria-hidden="true">{asset ? <img src={asset} alt=""/> : <span>{note.icon ?? <Sparkles/>}</span>}</div><div><span>{entry?.family ?? note.category}</span><h1>{note.name}</h1><p>{entry?.character ?? note.shortDescription}</p><small>{layers.map(layer => `${layer[0].toUpperCase()}${layer.slice(1)} note`).join(' · ')}</small></div></header>{entry ? <div className="note-detail-body"><section><h2>Seperti apa aromanya?</h2><p>{entry.description}</p><p>{entry.imagine}</p></section><section><h2>Perannya dalam parfum</h2><p>{entry.role}</p></section>{pairings ? <section className="note-pairing-groups"><h2>Untuk dieksplor</h2><p>Ini bukan aturan formula—hanya ide kurasi untuk membayangkan arah aroma lain di Lab.</p>{(Object.keys(pairingLabels) as NotePairingKind[]).map(kind => { const group = pairings[kind]; const targets = [...new Set(group.ids)].filter(id => id !== note.id).map(id => notes.find(candidate => candidate.note.id === id)?.note).filter(Boolean); if (!targets.length) return null; return <div className="note-pairing-group" key={kind}><h3>{pairingLabels[kind]}</h3><p>{group.description}</p><div className="note-pair-list">{targets.map(target => { const targetNote = target!; const targetAsset = getNoteStickerAsset(targetNote); return <button type="button" key={targetNote.id} onClick={() => onOpenNote(targetNote.id)}>{targetAsset ? <img src={targetAsset} alt=""/> : null}<span>{targetNote.name}</span></button> })}</div></div> })}</section> : null}<aside className="little-lab-note"><BookOpen aria-hidden="true"/><div><strong>Little Lab Note</strong><p>{entry.labNote}</p></div></aside></div> : <div className="note-detail-body"><section><h2>Catatan sedang disiapkan</h2><p>Deskripsi lengkap untuk note ini belum tersedia. Untuk sekarang, kamu masih bisa mengenalinya sebagai {note.category.toLowerCase()} dengan karakter {note.shortDescription.toLowerCase()}.</p></section></div>}</article>
}
