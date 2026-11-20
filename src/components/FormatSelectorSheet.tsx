import { ArrowRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ProductOption } from '../data/products'
import { formatPrice } from '../lib/currency'
import type { ProductChoice } from '../types'

interface FormatSelectorSheetProps {
  open: boolean
  options: ProductOption[]
  selected: ProductChoice | null
  playSetBlendCount: number
  getItNowBusy: boolean
  getItNowMessage: string
  onSelect: (product: ProductChoice) => void
  onAddToBag: () => void
  onGetItNow: () => void
  onClose: () => void
}

export function FormatSelectorSheet({ open, options, selected, playSetBlendCount, getItNowBusy, getItNowMessage, onSelect, onAddToBag, onGetItNow, onClose }: FormatSelectorSheetProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  const selectedOption = options.find(option => option.id === selected) ?? null
  const stockLabel = (option: ProductOption) => {
    if (option.stockAvailable === null || option.stockAvailable > 5) return null
    if (option.stockAvailable === 0) return 'Habis'
    if (option.id === 'play-set' && option.stockAvailable !== 1) return null
    return `Sisa ${option.stockAvailable} ${option.id === 'play-set' ? 'set' : 'botol'}`
  }
  const addLabel = selected === 'play-set'
    ? playSetBlendCount === 3 ? 'ADD PLAY SET TO BAG' : playSetBlendCount === 2 ? 'COMPLETE PLAY SET' : 'SAVE MIX & CONTINUE'
    : 'ADD TO BAG'
  const canSelectFormat = selectedOption?.stockAvailable !== 0
  const canGetItNow = Boolean(selectedOption) && canSelectFormat && (selected !== 'play-set' || playSetBlendCount === 3)

  return <div className="format-selector-layer" role="presentation">
    <button className="format-selector-backdrop" onClick={onClose} aria-label="Close format selector" />
    <section className="format-selector-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="format-selector-title">
      <div className="format-selector-handle" aria-hidden="true" />
      <header><div><h2 id="format-selector-title">Choose your format.</h2><p>Same mix. Different size.</p></div><button ref={closeRef} onClick={onClose} aria-label="Close format selector"><X /></button></header>
      <div className="format-option-list" role="radiogroup" aria-label="Fragrance format">
        {options.map(option => <button key={option.id} className={`format-option ${selected === option.id ? 'selected' : ''} ${option.id === 'play-set' ? 'play-set-option' : ''}`} role="radio" aria-checked={selected === option.id} disabled={option.stockAvailable === 0} onClick={() => onSelect(option.id)}>
          <i className="format-radio" aria-hidden="true" />
          <img src="/bottle/perfun-bottle.webp" alt="" draggable="false" />
          <span className="format-option-copy">{option.badge ? <em>{option.badge}</em> : null}<strong>{option.label}</strong><small>{option.description}</small>{stockLabel(option) ? <b className={`format-stock-badge${option.stockAvailable === 0 ? ' unavailable' : ''}`}>{stockLabel(option)}</b> : null}</span>
          <span className="format-option-price">{option.normalPrice > option.openingPrice ? <s>{formatPrice(option.normalPrice)}</s> : null}<b>{formatPrice(option.openingPrice)}</b></span>
        </button>)}
      </div>
      <div className="format-selector-actions"><button className="get-it-now" disabled={!canGetItNow || getItNowBusy} aria-describedby="direct-checkout-note" onClick={onGetItNow}>{getItNowBusy ? 'PREPARING CHECKOUT…' : <>GET IT NOW <ArrowRight /></>}</button><small id="direct-checkout-note">{getItNowMessage}</small><button className="format-add-to-bag" disabled={!selectedOption || !canSelectFormat || getItNowBusy} onClick={onAddToBag}>{addLabel}</button></div>
    </section>
  </div>
}
