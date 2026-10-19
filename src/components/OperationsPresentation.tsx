import type { ReactNode } from 'react'
import { BottleSizeDisplay, FormulaNotes, type FormulaSnapshot, WorkspaceCardHeader, WorkspaceMetricGrid, WorkspacePageHeader, WorkspaceStatusTabs } from './WorkspacePresentation'

/** Data-agnostic Calm Lab primitives shared by simulator and future workspace integrations. */
export function OperationsPageShell({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`operations-page-shell ${className}`.trim()}>{children}</section> }
export function OperationsPageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) { return <WorkspacePageHeader eyebrow={eyebrow} title={title}>{children}</WorkspacePageHeader> }
export function OperationsStatusTabs({ label, items }: { label: string; items: Array<{ id: string; label: string; count?: string | number; active: boolean; onClick: () => void }> }) { return <WorkspaceStatusTabs label={label} items={items}/> }
export function OperationsMetricCards({ items }: { items: Array<{ label: string; value: ReactNode }> }) { return <WorkspaceMetricGrid className="operations-metric-cards">{items.map(item => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</WorkspaceMetricGrid> }
export function OperationsOrderCard({ children, className = '', action }: { children: ReactNode; className?: string; action?: ReactNode }) { return <article className={`operations-order-card ${className}`.trim()}>{children}{action ? <div className="operations-action-bar">{action}</div> : null}</article> }
export function OperationsOrderHeader({ orderNumber, status, time }: { orderNumber: string; status?: string; time?: ReactNode }) { return <WorkspaceCardHeader orderNumber={orderNumber} status={status} time={time}/> }
export function OperationsBottleList({ children }: { children: ReactNode }) { return <div className="operations-bottle-list">{children}</div> }
export function OperationsBottleSize({ volumeMl, bottleCount, playSet = false, detail = false }: { volumeMl: number; bottleCount: number; playSet?: boolean; detail?: boolean }) { return <BottleSizeDisplay volumeMl={volumeMl} bottleCount={bottleCount} playSet={playSet} variant={detail ? 'detail' : 'compact'}/> }
export function OperationsFormulaRow({ formula, label }: { formula: FormulaSnapshot; label: string }) { return <div className="operations-formula-row"><strong>{label}</strong><FormulaNotes formula={formula} title={label} variant="compact"/></div> }
export function OperationsActionBar({ children }: { children: ReactNode }) { return <div className="operations-action-bar">{children}</div> }
export function OperationsShippingPanel({ children }: { children: ReactNode }) { return <section className="operations-shipping-panel">{children}</section> }
export function OperationsEmptyState({ title, children }: { title: string; children: ReactNode }) { return <div className="screen-empty operations-empty-state"><h2>{title}</h2><p>{children}</p></div> }
