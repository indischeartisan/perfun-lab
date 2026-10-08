import { ArrowRight, Check, ChevronRight, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { layerCopy } from '../data/notes'
import type { CompleteSelection, FragranceNote, NoteLayer, ProductChoice, Selection } from '../types'
import type { Catalog } from '../lib/catalog'
import { getNoteStickerAsset } from '../lib/noteAssets'
import { getNoteDescriptor } from '../lib/noteDescriptors'
import { BottlePreview } from './BottlePreview'
import { FormatSelectorSheet } from './FormatSelectorSheet'

const layers: NoteLayer[] = ['top', 'middle', 'base']
const selectorCopy: Record<NoteLayer, string> = { top: 'First impression', middle: 'Main character', base: 'What stays' }

interface BuilderProps {
  catalog: Catalog
  selection: Selection
  product: ProductChoice | null
  playSetBlends: CompleteSelection[]
  editingPlaySetIndex: number | null
  added: boolean
  onSelect: (layer: NoteLayer, note: FragranceNote) => void
  onProduct: (product: ProductChoice) => void
  onAdd: () => void
  onSavePlaySetBlend: () => void
  onAddPlaySet: () => void
  onEditPlaySetBlend: (index: number) => void
  onCancelPlaySetEdit: () => void
  onExitPlaySet: () => void
  onClearFormula: () => void
  onViewBag: () => void
  onGetItNow: (product: ProductChoice, formula: CompleteSelection, playSetBlends: CompleteSelection[]) => void
  getItNowBusy: boolean
  getItNowError: string
}

export function Builder({ catalog, selection, product, playSetBlends, editingPlaySetIndex, added, onSelect, onProduct, onAdd, onSavePlaySetBlend, onAddPlaySet, onEditPlaySetBlend, onCancelPlaySetEdit, onExitPlaySet, onClearFormula, onViewBag, onGetItNow, getItNowBusy, getItNowError }: BuilderProps) {
  const { noteGroups, productOptions } = catalog
  const [picker, setPicker] = useState<NoteLayer | null>(null)
  const [formatSelectorOpen, setFormatSelectorOpen] = useState(false)
  const selectedCount = layers.filter(layer => selection[layer]).length
  const complete = selectedCount === 3
  const result = useMemo(() => createResult(selection), [selection])
  const partial = getPartialFeedback(selection)

  useEffect(() => {
    if (!picker) return
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') setPicker(null) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [picker])

  function selectNote(note: FragranceNote) {
    if (!picker) return
    if (isSoapyUsedInAnotherLayer(selection, picker, note)) return
    onSelect(picker, note)
    setPicker(null)
  }

  function openFormatSelector() {
    if (!complete || !productOptions.length) return
    if (product === null) onProduct(productOptions[0].id)
    setFormatSelectorOpen(true)
  }

  function addSelectedFormatToBag() {
    if (product === null) return
    if (product === 'play-set') {
      if (playSetBlends.length === 3 && editingPlaySetIndex === null) onAddPlaySet()
      else onSavePlaySetBlend()
    } else onAdd()
    setFormatSelectorOpen(false)
  }

  function getSelectedFormatNow() {
    if (product === null || !selection.top || !selection.middle || !selection.base) return
    if (product === 'play-set' && playSetBlends.length !== 3) return
    setFormatSelectorOpen(false)
    onGetItNow(product, { top: selection.top, middle: selection.middle, base: selection.base }, playSetBlends)
  }

  function saveCurrentPlaySetMix() {
    if (!complete || product !== 'play-set') return
    onSavePlaySetBlend()
  }

  function getPlaySetNow() {
    const lastBlend = playSetBlends[2]
    if (!lastBlend || playSetBlends.length !== 3) return
    onGetItNow('play-set', lastBlend, playSetBlends)
  }

  const closeFormatSelector = useCallback(() => setFormatSelectorOpen(false), [])

  return <section className="builder-core">
    <header className="builder-core-title"><h1>Make your mix.</h1><p>Pick one top, one middle, one base.</p><small>There&apos;s no wrong mix.</small></header>

    {product === 'play-set' ? <PlaySetProgress blends={playSetBlends} editingIndex={editingPlaySetIndex} selectionComplete={complete} onEdit={onEditPlaySetBlend} onCancelEdit={onCancelPlaySetEdit} onExit={onExitPlaySet} /> : null}

    <div className="composer-card">
      <div className="composer-bottle"><BottlePreview selection={selection}/><small>{selectedCount} / 3 NOTES SELECTED</small></div>
      <div className="selector-stack">
        {layers.map((layer, index) => <button className={`note-selector ${selection[layer] ? 'has-note' : ''}`} key={layer} onClick={() => setPicker(layer)} aria-haspopup="dialog">
          <span className="selector-number">0{index + 1}</span>
          <span className="selector-copy"><small>{layer.toUpperCase()}</small><i>{selectorCopy[layer]}</i></span>
          <PickerSticker note={selection[layer]} />
          <span className="selector-note"><strong>{selection[layer]?.name ?? 'Choose a note'}</strong>{selection[layer] ? <span className="selector-tags">{selection[layer]!.shortDescription.split(' · ').slice(0, 3).map(tag => <small key={tag}>{tag}</small>)}</span> : null}</span>
          <ChevronRight/>
        </button>)}
      </div>
    </div>

    {complete && result ? <section className="scent-story"><span>✧ {product === 'play-set' ? editingPlaySetIndex === null ? playSetBlends.length === 3 ? 'PLAY SET COMPLETE.' : `MIX ${playSetBlends.length + 1} READY.` : `EDITING MIX ${editingPlaySetIndex + 1}.` : 'YOU MADE THIS.'}</span><h2>{result.name}</h2><p>{result.copy}</p>{product === 'play-set' && (editingPlaySetIndex !== null || playSetBlends.length < 3) ? <div className="play-set-mix-actions"><button className="get-this-mix" onClick={saveCurrentPlaySetMix}>{editingPlaySetIndex !== null ? 'SAVE CHANGES' : playSetBlends.length === 2 ? 'COMPLETE PLAY SET' : 'SAVE MIX & CONTINUE'} <ArrowRight /></button>{editingPlaySetIndex !== null ? <button className="play-set-cancel-edit" onClick={onCancelPlaySetEdit}>CANCEL EDIT</button> : null}</div> : product !== 'play-set' && !added ? <button className="get-this-mix" onClick={openFormatSelector} disabled={!productOptions.length}>GET THIS MIX <ArrowRight /></button> : null}{getItNowError ? <small className="mix-purchase-error" role="alert">{getItNowError}</small> : null}</section> : null}

    {product === 'play-set' && playSetBlends.length === 3 && editingPlaySetIndex === null ? <section className="play-set-summary" aria-labelledby="play-set-summary-title"><div><span>✧ PLAY SET COMPLETE.</span><h2 id="play-set-summary-title">Your three mixes.</h2></div><ol>{playSetBlends.map((blend, index) => <li key={`${blend.top.id}-${blend.middle.id}-${blend.base.id}-${index}`}><span>MIX {index + 1}</span><strong>{slashBlendName(blend)}</strong><button onClick={() => onEditPlaySetBlend(index)}>EDIT</button></li>)}</ol>{!added ? <div className="play-set-summary-actions"><button className="play-set-get-now" onClick={getPlaySetNow} disabled={getItNowBusy}>{getItNowBusy ? 'PREPARING CHECKOUT…' : <>GET IT NOW <ArrowRight /></>}</button><button className="play-set-add-bag" onClick={onAddPlaySet} disabled={getItNowBusy}>ADD TO BAG</button></div> : null}{getItNowError ? <small className="mix-purchase-error" role="alert">{getItNowError}</small> : null}</section> : null}

    {complete && added ? <div className="added-confirmation" role="status"><strong><Check/> {product === 'play-set' ? 'Play Set added to your bag.' : 'Added to your bag.'}</strong><div><button onClick={onClearFormula}>MAKE ANOTHER BLEND</button><button onClick={onViewBag}>VIEW BAG <ArrowRight/></button></div></div> : null}

    {!complete && (product !== 'play-set' || selectedCount > 0) ? <section className={`prediction-panel state-${selectedCount ? 'partial' : 'empty'}`}>
      <div className="prediction-text"><span>{complete ? 'YOU MADE THIS.' : 'SCENT PREDICTION'}</span>
        {selectedCount === 0 ? <><h2>Waiting for your notes.</h2><p>Pick three notes to reveal your scent prediction.</p></> : null}
        {selectedCount > 0 && !complete ? <><h2>So far...</h2><p>{partial}</p></> : null}
      </div>
      {selectedCount > 0 ? <button className="start-over" onClick={onClearFormula}><RotateCcw size={15}/> Clear formula</button> : null}
    </section> : null}

    <FormatSelectorSheet open={formatSelectorOpen && complete} options={productOptions} selected={product} playSetBlendCount={playSetBlends.length} getItNowBusy={getItNowBusy} getItNowMessage={product === 'play-set' && playSetBlends.length !== 3 ? 'Save each mix to unlock checkout.' : 'Proceed to checkout'} onSelect={onProduct} onAddToBag={addSelectedFormatToBag} onGetItNow={getSelectedFormatNow} onClose={closeFormatSelector} />

    {picker ? <div className="picker-layer" role="presentation"><button className="picker-backdrop" onClick={() => setPicker(null)} aria-label="Close note picker"/><section className="note-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title"><header><div><span>{picker.toUpperCase()} NOTE</span><h2 id="picker-title">{layerCopy[picker].title}</h2><p>{selectorCopy[picker]}</p></div><button onClick={() => setPicker(null)} aria-label="Close"><X/></button></header><div className="picker-options">{!noteGroups[picker].length ? <p>Notes in this phase are temporarily unavailable.</p> : null}{noteGroups[picker].map(note => {
      const selected = selection[picker]?.id === note.id
      const unavailable = isSoapyUsedInAnotherLayer(selection, picker, note)
      return <button key={note.id} className={`${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`} disabled={unavailable} onClick={() => selectNote(note)}><PickerOptionArt note={note}/><span><strong>{note.name}</strong><small>{unavailable ? 'Already used in this blend' : note.shortDescription}</small></span>{selected ? <Check/> : <ChevronRight/>}</button>
    })}</div></section></div> : null}
  </section>
}

function PickerSticker({ note }: { note: FragranceNote | null }) {
  const [assetFailed, setAssetFailed] = useState(false)
  const asset = note ? getNoteStickerAsset(note) : null

  if (note && asset && !assetFailed) return <span className="selector-sticker"><img src={asset} alt="" draggable="false" decoding="async" onError={() => setAssetFailed(true)} /></span>
  if (note) return <b className="selector-sticker selector-sticker-fallback" style={{ backgroundColor: note.stickerColor }} aria-hidden="true">{note.icon}</b>
  return <span className="selector-sticker selector-sticker-empty" aria-hidden="true" />
}

function PickerOptionArt({ note }: { note: FragranceNote }) {
  const [assetFailed, setAssetFailed] = useState(false)
  const asset = getNoteStickerAsset(note)

  if (asset && !assetFailed) return <span className="picker-option-art"><img src={asset} alt="" draggable="false" decoding="async" onError={() => setAssetFailed(true)} /></span>
  return <i style={{ backgroundColor: note.stickerColor }} aria-hidden="true">{note.icon}</i>
}

function isSoapyUsedInAnotherLayer(selection: Selection, layer: NoteLayer, note: FragranceNote) {
  return note.id === 'soapy' && layers.some(otherLayer => otherLayer !== layer && selection[otherLayer]?.id === 'soapy')
}

function createResult(selection: Selection) {
  if (!selection.top || !selection.middle || !selection.base) return null
  const notes = [selection.top, selection.middle, selection.base]
  return {
    name: `${notes.map(note => note.name).join(' / ')}.`,
    copy: `${getNoteDescriptor(selection.top)} up top. ${getNoteDescriptor(selection.middle)} in the middle. ${getNoteDescriptor(selection.base)} at the base.`,
  }
}

function blendName(blend: CompleteSelection) {
  return `${blend.top.name} · ${blend.middle.name} · ${blend.base.name}`
}

function slashBlendName(blend: CompleteSelection) {
  return `${blend.top.name} / ${blend.middle.name} / ${blend.base.name}`
}

function PlaySetProgress({ blends, editingIndex, selectionComplete, onEdit, onCancelEdit, onExit }: { blends: CompleteSelection[]; editingIndex: number | null; selectionComplete: boolean; onEdit: (index: number) => void; onCancelEdit: () => void; onExit: () => void }) {
  const activeIndex = editingIndex ?? Math.min(blends.length, 2)
  const statusFor = (index: number) => {
    if (editingIndex === index) return selectionComplete ? 'Ready to save' : 'In progress'
    if (index < blends.length) return 'Completed'
    if (index === activeIndex) return selectionComplete ? 'Ready to save' : 'In progress'
    return 'Not started'
  }

  return <section className="play-set-progress" aria-live="polite">
    <header><div><span>PLAY SET — 3 × 10 ML</span><strong>{blends.length === 3 && editingIndex === null ? 'Your Play Set is complete.' : `${blends.length} / 3 mixes saved`}</strong></div><div>{editingIndex !== null && !selectionComplete ? <button onClick={onCancelEdit}>CANCEL EDIT</button> : null}<button onClick={onExit}>EXIT PLAY SET</button></div></header>
    <ol>{[0, 1, 2].map(index => {
      const blend = blends[index]
      const editing = editingIndex === index
      return <li className={`${blend ? 'completed' : ''} ${editing ? 'editing' : ''} ${!blend && index === activeIndex ? 'active' : ''}`} key={index}><span>MIX {index + 1}</span><strong>{blend ? slashBlendName(blend) : statusFor(index)}</strong><small>{statusFor(index)}</small>{blend && !editing ? <button onClick={() => onEdit(index)}>EDIT</button> : null}</li>
    })}</ol>
  </section>
}

function getPartialFeedback(selection: Selection) {
  const chosen = layers.filter(layer => selection[layer])
  const missing = layers.find(layer => !selection[layer])
  const traits = dominantTraits(chosen.flatMap(layer => selection[layer] ? [selection[layer]!] : []))
  const opening = traits.length > 1 ? `${capitalize(traits[0])} and ${traits[1]}` : capitalize(traits[0] ?? 'Taking shape')
  const microcopy = chosen.length === 2 ? 'One note left. Don’t overthink it.' : 'This could get interesting.'
  return `${microcopy} ${opening} so far. Choose a ${missing ? capitalize(missing) : 'note'} to ${missing === 'base' ? 'see where it settles' : 'keep shaping the story'}.`
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }

function dominantTraits(notes: FragranceNote[]) {
  const keys = Object.keys(notes[0]?.profile ?? {}) as Array<keyof FragranceNote['profile']>
  return keys.map(key => ({ key, score: notes.reduce((sum, note) => sum + note.profile[key], 0) })).sort((a, b) => b.score - a.score).map(item => item.key)
}
