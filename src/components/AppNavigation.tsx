import { FlaskConical, MoreHorizontal, Package, ShoppingBag } from 'lucide-react'
import type { AppView } from '../types'

const items = [
  { id: 'build' as const, label: 'Build', icon: FlaskConical },
  { id: 'bag' as const, label: 'Bag', icon: ShoppingBag },
  { id: 'orders' as const, label: 'Orders', icon: Package },
  { id: 'more' as const, label: 'More', icon: MoreHorizontal }
]

export function AppNavigation({ active, count, onNavigate }: { active: AppView; count: number; onNavigate: (view: AppView) => void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">{items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onNavigate(id)} aria-current={active === id ? 'page' : undefined}><span><Icon size={20} strokeWidth={1.8}/>{id === 'bag' && count > 0 ? <b>{count}</b> : null}</span><small>{label}</small></button>)}</nav>
}
