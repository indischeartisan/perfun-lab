import { ClipboardList, Factory, LayoutDashboard, MoreHorizontal, WalletCards } from 'lucide-react'
import type { AppView } from '../types'

type WorkspaceRole = 'admin' | 'vendor' | 'perfumer'
export type AdminWorkspaceTab = 'Overview' | 'Orders' | 'Operations' | 'More' | 'Customers' | 'Notes' | 'Products & Pricing' | 'Vendor Payments' | 'Revenue'
const groups: Array<{ label: string; items: Array<{ id: AdminWorkspaceTab; label: string; icon: typeof Factory }> }> = [
  { label: 'Main', items: [{ id: 'Overview', label: 'Dashboard', icon: LayoutDashboard }, { id: 'Orders', label: 'Orders', icon: ClipboardList }, { id: 'Operations', label: 'Operations', icon: Factory }] },
  { label: 'Management', items: [{ id: 'Customers', label: 'Customers', icon: ClipboardList }, { id: 'Notes', label: 'Notes', icon: ClipboardList }, { id: 'Products & Pricing', label: 'Products & Pricing', icon: Factory }] },
  { label: 'Finance', items: [{ id: 'Vendor Payments', label: 'Vendor Payments', icon: WalletCards }, { id: 'Revenue', label: 'Revenue', icon: WalletCards }] },
]
const vendorItems = [{ id: 'production' as const, label: 'Pekerjaan', icon: Factory }, { id: 'payouts' as const, label: 'Payments', icon: WalletCards }]

export function WorkspaceNavigation({ role, active, onNavigate }: { role: WorkspaceRole; active: AppView; onNavigate: (view: AppView) => void }) {
  if (role === 'admin') return null
  const items = role === 'vendor' ? vendorItems : vendorItems.slice(0, 1)
  return <nav className="workspace-nav" aria-label={`${role} workspace navigation`}>{items.map(({ id, label, icon: Icon }) => { const selected = active === id || (role === 'vendor' && id === 'production' && active === 'fulfillment'); return <button key={id} className={selected ? 'active' : ''} aria-current={selected ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={19}/><span>{role === 'perfumer' ? 'Production' : label}</span></button> })}</nav>
}

export function AdminWorkspaceNavigation({ active, onNavigate }: { active: AdminWorkspaceTab; onNavigate: (value: AdminWorkspaceTab) => void }) {
  const mobileActive = ['Overview', 'Orders', 'Operations'].includes(active) ? active : 'More'
  const mobile = [...groups[0].items, { id: 'More' as const, label: 'More', icon: MoreHorizontal }]
  return <><nav className="admin-desktop-nav" aria-label="Admin workspace navigation">{groups.map(group => <section key={group.label}><h2>{group.label}</h2>{group.items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={18}/><span>{label}</span></button>)}</section>)}</nav><nav className="workspace-nav admin-workspace-nav" aria-label="Admin workspace navigation">{mobile.map(({ id, label, icon: Icon }) => <button key={id} className={mobileActive === id ? 'active' : ''} aria-current={mobileActive === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={19}/><span>{label}</span></button>)}</nav></>
}

export function AdminMoreMenu({ onNavigate }: { onNavigate: (value: AdminWorkspaceTab) => void }) {
  return <section className="admin-more-page"><h1>More</h1>{groups.slice(1).map(group => <section key={group.label}><h2>{group.label}</h2>{group.items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)}><Icon size={18}/><span>{label}</span><b aria-hidden="true">›</b></button>)}</section>)}</section>
}
