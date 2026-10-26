import type { ReactNode } from 'react'
import { BottleSizeDisplay, FormulaNotes, WorkspaceCardHeader, type FormulaSnapshot } from './WorkspacePresentation'

// Presentation only: data and mutations remain in each authenticated workspace.
export function OperationsPageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="operations-page-header"><h1>{title}</h1>{children ? <p>{children}</p> : null}</header>
}
export function OperationsStatusTabs({ label, items }: { label: string; items: Array<{ id: string; label: string; count?: number | string; active: boolean; onClick: () => void }> }) {
  return <nav className="operations-tabs" aria-label={label}>{items.map(item => <button type="button" key={item.id} aria-pressed={item.active} onClick={item.onClick}><span>{item.label}</span>{item.count !== undefined ? <b>{item.count}</b> : null}</button>)}</nav>
}
export function OperationsOrderCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <article className={`customer-order operations-order-card ${className}`.trim()}>{children}</article>
}
export function OperationsOrderHeader({ orderNumber, status, time }: { orderNumber: string; status?: string; time?: ReactNode }) {
  return <WorkspaceCardHeader orderNumber={orderNumber} status={status} time={time}/>
}
export function OperationsBottleSize({ volumeMl, bottleCount, detail = false }: { volumeMl: number; bottleCount: number; detail?: boolean }) {
  return <BottleSizeDisplay volumeMl={volumeMl} bottleCount={bottleCount} playSet={bottleCount === 3 && volumeMl === 10} variant={detail ? 'detail' : 'compact'}/>
}
export function OperationsFormulaRow({ formula, label }: { formula: FormulaSnapshot; label: string }) {
  return <FormulaNotes formula={formula} title={label} variant="compact"/>
}
