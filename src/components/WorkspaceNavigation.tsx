import { ClipboardList, Factory, LayoutDashboard, MoreHorizontal, Truck, WalletCards } from 'lucide-react'
import type { AppView } from '../types'

type WorkspaceRole = 'admin' | 'vendor' | 'perfumer'

const vendorItems = [
  { id: 'production' as const, label: 'Production', icon: Factory },
  { id: 'fulfillment' as const, label: 'Fulfillment', icon: Truck },
  { id: 'payouts' as const, label: 'Payments', icon: WalletCards },
]
const adminItems = [
  { id: 'Overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Orders', label: 'Orders', icon: ClipboardList },
  { id: 'Production', label: 'Production', icon: Factory },
  { id: 'More', label: 'More', icon: MoreHorizontal },
] as const

export function WorkspaceNavigation({ role, active, onNavigate }: { role: WorkspaceRole; active: AppView; onNavigate: (view: AppView) => void }) {
  if (role === 'admin') return null
  const items = role === 'vendor' ? vendorItems : vendorItems.slice(0, 1)
  return <nav className="workspace-nav" aria-label={`${role} workspace navigation`}>
    {items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={19}/><span>{label}</span></button>)}
  </nav>
}

export function AdminWorkspaceNavigation({ active, onNavigate }: { active: 'Overview' | 'Orders' | 'Production' | 'More'; onNavigate: (value: 'Overview' | 'Orders' | 'Production' | 'More') => void }) {
  return <nav className="workspace-nav admin-workspace-nav" aria-label="Admin workspace navigation">
    {adminItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={19}/><span>{label}</span></button>)}
  </nav>
}
