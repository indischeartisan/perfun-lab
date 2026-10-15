import type { ReactNode } from 'react'
import { getNoteStickerAsset } from '../lib/noteAssets'

export type FormulaSnapshot = { top: string | null; middle: string | null; base: string | null }

/** Shared, data-agnostic shell used by the fixture and authenticated workspaces. */
export function WorkspacePageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="workspace-page-header">{eyebrow ? <span>{eyebrow}</span> : null}<h1>{title}</h1>{children ? <p>{children}</p> : null}</header>
}

export function WorkspaceStatusTabs({ label, items }: { label: string; items: Array<{ id: string; label: string; count?: number | string; active: boolean; onClick: () => void }> }) {
  return <nav className="workspace-status-tabs" aria-label={label}>{items.map(item => <button type="button" key={item.id} aria-pressed={item.active} className={item.active ? 'active' : ''} onClick={item.onClick}><span>{item.label}</span>{item.count !== undefined ? <b>{item.count}</b> : null}</button>)}</nav>
}

export function WorkspaceMetricGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`workspace-metric-grid ${className}`.trim()}>{children}</div>
}

export function WorkspaceSection({ eyebrow, title, children, className = '' }: { eyebrow?: string; title: string; children: ReactNode; className?: string }) {
  return <section className={`workspace-section ${className}`.trim()}>{eyebrow ? <span className="workspace-section-eyebrow">{eyebrow}</span> : null}<h2>{title}</h2>{children}</section>
}

export function BottleSizeDisplay({ volumeMl, bottleCount, playSet = false, variant = 'compact' }: { volumeMl: number; bottleCount: number; playSet?: boolean; variant?: 'compact' | 'detail' }) {
  const quantity = `${bottleCount} ${bottleCount === 1 ? 'bottle' : 'bottles'}`
  return <div className={`bottle-size-display bottle-size-display--${variant}`}><strong>{playSet ? `${bottleCount} × ${volumeMl} ml` : `${volumeMl} ml`}</strong><span>{playSet ? 'Play Set' : quantity}</span>{playSet ? <small>{quantity}</small> : null}</div>
}

export function WorkspaceCardHeader({ orderNumber, status, time }: { orderNumber: string; status?: string; time?: ReactNode }) {
  return <header className="workspace-card-header"><strong>{orderNumber}</strong>{time ? <time>{time}</time> : null}{status ? <b className="order-status">{status}</b> : null}</header>
}

export function FormulaNotes({ formula, title = 'Formula', variant = 'compact' }: { formula: FormulaSnapshot; title?: string; variant?: 'compact' | 'cards' }) {
  return <section className={`production-formula production-formula--${variant}`} aria-label={title}><h3>{title}</h3><dl>{(['top', 'middle', 'base'] as const).map(phase => {
    const note = formula[phase]
    const asset = note ? getNoteStickerAsset({ id: note.trim().toLowerCase().replaceAll(' ', '-') }) : null
    return <div className="formula-note" key={phase}><dt>{phase === 'middle' ? 'Middle' : phase[0].toUpperCase() + phase.slice(1)}</dt><dd>{asset ? <img src={asset} alt="" aria-hidden="true"/> : null}<span>{note ?? 'Snapshot unavailable'}</span></dd></div>
  })}</dl></section>
}

export function ProductionAction({ label, onClick, disabled = false }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return <button type="button" className="orders-build" disabled={disabled} onClick={onClick}>{label}</button>
}
