import { ArrowRight, Check, ChevronRight, RotateCcw, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { layerCopy } from '../data/notes'
import type { CompleteSelection, FragranceNote, NoteLayer, ProductChoice, Selection } from '../types'
import { calculateScentProfile } from '../lib/prediction'
import type { Catalog } from '../lib/catalog'
import { formatPrice } from '../lib/currency'
import { BottlePreview } from './BottlePreview'

const layers: NoteLayer[] = ['top', 'middle', 'base']
const selectorCopy: Record<NoteLayer, string> = { top: 'First impression', middle: 'Main character', base: 'What stays' }

interface BuilderProps {
  catalog: Catalog
  selection: Selection
  product: ProductChoice | null
  playSetBlends: CompleteSelection[]
  added: boolean
  onSelect: (layer: NoteLayer, note: FragranceNote) => void
  onProduct: (product: ProductChoice) => void
  onAdd: () => void
  onAddPlaySetBlend: () => void
  onAddPlaySet: () => void
  onReset: () => void
  onViewBag: () => void
}

export function Builder({ catalog, selection, product, playSetBlends, added, onSelect, onProduct, onAdd, onAddPlaySetBlend, onAddPlaySet, onReset, onViewBag }: BuilderProps) {
  const { noteGroups, productOptions } = catalog
  const [picker, setPicker] = useState<NoteLayer | null>(null)
  const selectedCount = layers.filter(layer => selection[layer]).length
  const complete = selectedCount === 3
  const prediction = useMemo(() => createPrediction(selection), [selection])
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

  return <section className="builder-core">
    <header className="builder-core-title"><span><Sparkles size={12}/> PERFUN LAB BUILDER</span><h1>Build your scent.<em>＊</em></h1><p>Pick three. See where it goes.</p></header>

    {product === 'play-set' ? <section className="play-set-progress" aria-live="polite"><div><span>PLAY SET IN PROGRESS</span><strong>{playSetBlends.length} / 3 blends ready</strong></div><div>{[0, 1, 2].map(index => <i className={index < playSetBlends.length ? 'ready' : ''} key={index}>{index + 1}</i>)}</div>{playSetBlends.length ? <ol>{playSetBlends.map((blend, index) => <li key={`${blend.top.id}-${blend.middle.id}-${blend.base.id}-${index}`}>{blendName(blend)}</li>)}</ol> : null}</section> : null}

    <div className="composer-card">
      <div className="composer-bottle"><BottlePreview selection={selection}/><small>{selectedCount} / 3 NOTES SELECTED</small></div>
      <div className="selector-stack">
        {layers.map((layer, index) => <button className={`note-selector ${selection[layer] ? 'has-note' : ''}`} key={layer} onClick={() => setPicker(layer)} aria-haspopup="dialog">
          <span className="selector-number">0{index + 1}</span>
          <span className="selector-copy"><small>{layer.toUpperCase()}</small><i>{selectorCopy[layer]}</i><strong>{selection[layer]?.name ?? 'Choose a note'}</strong></span>
          {selection[layer] ? <b style={{ backgroundColor: selection[layer]!.stickerColor }}>{selection[layer]!.icon}</b> : <ChevronRight/>}
        </button>)}
      </div>
    </div>

    {complete && prediction ? <section className="scent-story"><span>✦ EXPERIMENT COMPLETE</span><h2>{prediction.name}</h2><p>{polishPredictionCopy(prediction.copy)}</p><div className="story-profile"><strong>YOUR SCENT MAY FEEL</strong><div className="profile-ranking" aria-label="Top five scent dimensions">{prediction.profile.map(item => <div className={`profile-row dimension-${item.dimension}`} key={item.dimension}><strong>{item.label}</strong><span aria-label={`${item.dots} out of 5 dots`}>{[1,2,3,4,5].map(dot => <i className={dot <= item.dots ? 'filled' : ''} key={dot}/>)}</span></div>)}</div></div></section> : null}

    <section className={`prediction-panel state-${complete ? 'complete' : selectedCount ? 'partial' : 'empty'}`}>
      <div className="prediction-text"><span>{complete ? 'EXPERIMENT COMPLETE' : 'SCENT PREDICTION'}</span>
        {selectedCount === 0 ? <><h2>Waiting for your notes.</h2><p>Pick three notes to reveal your scent prediction.</p></> : null}
        {selectedCount > 0 && !complete ? <><h2>So far...</h2><p>{partial}</p></> : null}
        {complete && prediction ? <><h2>{prediction.name}</h2><p>{prediction.copy}</p></> : null}
      </div>
      <div className="prediction-action">{!productOptions.length ? <p>Products are temporarily unavailable.</p> : null}
        {complete ? <><p>CHOOSE YOUR FORMAT</p><div className="size-selector product-options">{productOptions.map(option => <button key={option.id} className={`${product === option.id ? 'selected' : ''} ${option.id === 'play-set' ? 'play-set-option' : ''}`} onClick={() => onProduct(option.id)} aria-pressed={product === option.id}><span>{option.badge ? <em>{option.badge}</em> : null}<strong>{option.label}</strong><small>{option.description}</small></span><span className="product-price">{option.normalPrice > option.openingPrice ? <><s>{formatPrice(option.normalPrice)}</s><small>Opening Price</small></> : <small>Bundle Price</small>}<b>{formatPrice(option.openingPrice)}</b></span></button>)}</div></> : null}
        {added ? <div className="added-confirmation" role="status"><strong><Check/> {product === 'play-set' ? 'Play Set added to your bag.' : 'Added to your bag.'}</strong><div><button onClick={onReset}>MAKE ANOTHER BLEND</button><button onClick={onViewBag}>VIEW BAG <ArrowRight/></button></div></div> : product === 'play-set' && playSetBlends.length === 3 ? <button className="add-button" onClick={onAddPlaySet}>ADD PLAY SET TO BAG <ArrowRight/></button> : product === 'play-set' && complete ? <button className="add-button" onClick={onAddPlaySetBlend}>ADD BLEND {playSetBlends.length + 1} TO PLAY SET <ArrowRight/></button> : <button className="add-button" disabled={!complete || product === null} onClick={onAdd}>{product === 'play-set' ? `COMPLETE BLEND ${playSetBlends.length + 1} OF 3` : 'ADD TO BAG'} <ArrowRight/></button>}
        {selectedCount > 0 && !added ? <button className="start-over" onClick={onReset}><RotateCcw size={15}/> Clear formula</button> : null}
      </div>
    </section>

    {picker ? <div className="picker-layer" role="presentation"><button className="picker-backdrop" onClick={() => setPicker(null)} aria-label="Close note picker"/><section className="note-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title"><header><div><span>{picker.toUpperCase()} NOTE</span><h2 id="picker-title">{layerCopy[picker].title}</h2><p>{selectorCopy[picker]}</p></div><button onClick={() => setPicker(null)} aria-label="Close"><X/></button></header><div className="picker-options">{!noteGroups[picker].length ? <p>Notes in this phase are temporarily unavailable.</p> : null}{noteGroups[picker].map(note => {
      const selected = selection[picker]?.id === note.id
      const unavailable = isSoapyUsedInAnotherLayer(selection, picker, note)
      return <button key={note.id} className={`${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`} disabled={unavailable} onClick={() => selectNote(note)}><i style={{backgroundColor: note.stickerColor}}>{note.icon}</i><span><strong>{note.name}</strong><small>{unavailable ? 'Already used in this blend' : note.shortDescription}</small></span>{selected ? <Check/> : <ChevronRight/>}</button>
    })}</div></section></div> : null}
  </section>
}

function isSoapyUsedInAnotherLayer(selection: Selection, layer: NoteLayer, note: FragranceNote) {
  return note.id === 'soapy' && layers.some(otherLayer => otherLayer !== layer && selection[otherLayer]?.id === 'soapy')
}

function createPrediction(selection: Selection) {
  if (!selection.top || !selection.middle || !selection.base) return null
  const notes = [selection.top, selection.middle, selection.base]
  return { name: notes.map(note => note.name).join(' · '), copy: `${selection.top.predictionText} ${selection.middle.predictionText} ${selection.base.predictionText}`, profile: calculateScentProfile(selection.top, selection.middle, selection.base) }
}

function blendName(blend: CompleteSelection) {
  return `${blend.top.name} · ${blend.middle.name} · ${blend.base.name}`
}

function polishPredictionCopy(copy: string) {
  return copy.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
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
