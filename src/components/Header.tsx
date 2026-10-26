import type { AppView } from '../types'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { nextHeaderVisibility } from '../lib/headerVisibility'

interface HeaderProps { itemCount: number; activeView: AppView; onNavigate: (view: AppView) => void; fulfillmentOnly?: boolean; account?: ReactNode }

export function Header({ itemCount, activeView, onNavigate, fulfillmentOnly = false, account }: HeaderProps) {
  const [hidden, setHidden] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const visibilityRef = useRef({ hidden: false, lastScrollY: 0 })

  useEffect(() => {
    const showHeader = () => {
      visibilityRef.current = { hidden: false, lastScrollY: window.scrollY }
      setHidden(false)
    }
    showHeader()
    const onScroll = () => {
      if (headerRef.current?.contains(document.activeElement)) { showHeader(); return }
      const next = nextHeaderVisibility(visibilityRef.current, window.scrollY)
      if (next === visibilityRef.current) return
      visibilityRef.current = next
      setHidden(next.hidden)
    }
    const onKeyboardNavigation = (event: KeyboardEvent) => {
      if (event.key === 'Tab') showHeader()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKeyboardNavigation)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKeyboardNavigation) }
  }, [activeView])

  return <header ref={headerRef} className={`site-header${hidden ? ' customer-header-hidden' : ''}`} aria-hidden={hidden || undefined}>
    <button className="wordmark" onClick={() => onNavigate(fulfillmentOnly ? 'fulfillment' : 'explore')} aria-label={fulfillmentOnly ? 'Go to fulfillment' : 'Go to Explore'}><img src="/brand/perfun-lab-logo.webp" alt="PERFUN LAB"/></button>
    <nav className="desktop-nav" aria-label="Main navigation">
      {((fulfillmentOnly ? ['fulfillment'] : ['explore', 'build', 'bag', 'more']) as AppView[]).map(view => <button key={view} className={activeView === view ? 'active' : ''} aria-current={activeView === view ? 'page' : undefined} onClick={() => onNavigate(view)}>{view === 'build' ? 'Mix' : view}<i>{view === 'bag' && itemCount > 0 ? itemCount : ''}</i></button>)}
    </nav>
    <span className="header-status">PICK THREE. SEE WHERE IT GOES.</span>
    {account}
  </header>
}
