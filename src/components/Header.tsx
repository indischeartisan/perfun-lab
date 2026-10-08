import type { AppView } from '../types'
import type { ReactNode } from 'react'

interface HeaderProps { itemCount: number; activeView: AppView; onNavigate: (view: AppView) => void; fulfillmentOnly?: boolean; account?: ReactNode }

export function Header({ itemCount, activeView, onNavigate, fulfillmentOnly = false, account }: HeaderProps) {
  return <header className="site-header">
    <button className="wordmark" onClick={() => onNavigate(fulfillmentOnly ? 'fulfillment' : 'build')} aria-label={fulfillmentOnly ? 'Go to fulfillment' : 'Go to fragrance builder'}><img src="/brand/perfun-lab-logo.webp" alt="PERFUN LAB"/></button>
    <nav className="desktop-nav" aria-label="Main navigation">
      {((fulfillmentOnly ? ['fulfillment'] : ['build', 'bag', 'orders', 'more']) as AppView[]).map(view => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => onNavigate(view)}>{view}<i>{view === 'bag' && itemCount > 0 ? itemCount : ''}</i></button>)}
    </nav>
    <span className="header-status">PICK THREE. SEE WHERE IT GOES.</span>
    {account}
  </header>
}
