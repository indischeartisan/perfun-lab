import { ClipboardList, Factory, LayoutDashboard, MoreHorizontal, Truck, WalletCards } from 'lucide-react'
import type { AppView } from '../types'

type WorkspaceRole = 'admin' | 'vendor' | 'perfumer'

const vendorItems = [
  { id: 'production' as const, label: 'Production', icon: Factory },
  { id: 'fulfillment' as const, label: 'Fulfillment', icon: Truck },
  { id: 'payouts' as const, label: 'Payments', icon: WalletCards },
]
export type AdminWorkspaceTab = 'Overview' | 'Orders' | 'Production' | 'Fulfillment' | 'Vendor Workspace' | 'Customers' | 'Notes' | 'Products & Pricing' | 'Vendor Payments' | 'Revenue' | 'More'

const adminGroups: Array<{ label: string; items: Array<{ id: Exclude<AdminWorkspaceTab, 'More'>; label: string; icon: typeof LayoutDashboard }> }> = [
  { label: 'Main', items: [{ id: 'Overview', label: 'Dashboard', icon: LayoutDashboard }, { id: 'Orders', label: 'Orders', icon: ClipboardList }, { id: 'Production', label: 'Production', icon: Factory }] },
  { label: 'Operations', items: [{ id: 'Fulfillment', label: 'Fulfillment', icon: Truck }, { id: 'Vendor Workspace', label: 'Vendor Assignment', icon: Factory }] },
  { label: 'Management', items: [{ id: 'Customers', label: 'Customers', icon: ClipboardList }, { id: 'Notes', label: 'Notes', icon: ClipboardList }, { id: 'Products & Pricing', label: 'Products & Pricing', icon: Factory }] },
  { label: 'Finance', items: [{ id: 'Vendor Payments', label: 'Vendor Payments', icon: WalletCards }, { id: 'Revenue', label: 'Revenue', icon: WalletCards }] },
]

const mobileAdminItems = [
  { id: 'Overview' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Orders' as const, label: 'Orders', icon: ClipboardList },
  { id: 'Production' as const, label: 'Production', icon: Factory },
  { id: 'More' as const, label: 'More', icon: MoreHorizontal },
]

export function WorkspaceNavigation({ role, active, onNavigate }: { role: WorkspaceRole; active: AppView; onNavigate: (view: AppView) => void }) {
  if (role === 'admin') return null
  const items = role === 'vendor' ? vendorItems : vendorItems.slice(0, 1)
  return <nav className="workspace-nav" aria-label={`${role} workspace navigation`}>
    {items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={19}/><span>{label}</span></button>)}
  </nav>
}

export function AdminWorkspaceNavigation({ active, onNavigate }: { active: AdminWorkspaceTab; onNavigate: (value: AdminWorkspaceTab) => void }) {
  const mobileActive = ['Overview', 'Orders', 'Production'].includes(active) ? active : 'More'
  return <>
    <nav className="admin-desktop-nav" aria-label="Admin workspace navigation">{adminGroups.map(group => <section key={group.label}><span>{group.label}</span>{group.items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={18}/><span>{label}</span></button>)}</section>)}</nav>
    <nav className="workspace-nav admin-workspace-nav" aria-label="Admin workspace navigation">{mobileAdminItems.map(({ id, label, icon: Icon }) => <button key={id} className={mobileActive === id ? 'active' : ''} aria-current={mobileActive === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
  </>
}

export function AdminMoreMenu({ active, onNavigate }: { active: AdminWorkspaceTab; onNavigate: (value: AdminWorkspaceTab) => void }) {
  return <section className="admin-more-page"><header><span>ADMIN WORKSPACE</span><h1>More</h1><p>Tools to run the lab.</p></header>{adminGroups.slice(1).map(group => <section key={group.label}><h2>{group.label}</h2><div>{group.items.map(({ id, label, icon: Icon }) => <button key={id} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={18}/><span>{label}</span><b aria-hidden="true">›</b></button>)}</div></section>)}</section>
}
