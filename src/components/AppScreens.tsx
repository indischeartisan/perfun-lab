import { ChevronRight, CircleHelp, FileText, Mail, Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react'
import { isPlaySet } from '../lib/cart'
import { formatPrice } from '../lib/currency'
import type { BottleSize, CartItem, CompleteSelection, TestOrder } from '../types'

interface BagProps { items: CartItem[]; onQuantity: (id: string, quantity: number) => void; onSize: (id: string, size: BottleSize) => void; onRemove: (id: string) => void; onBuild: () => void; onCheckout: () => void }

export function BagScreen({ items, onQuantity, onSize, onRemove, onBuild, onCheckout }: BagProps) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  return <section className="app-screen"><ScreenTitle eyebrow="YOUR COLLECTION" title="Bag" copy={items.length ? `${items.length} product${items.length === 1 ? '' : 's'}, saved on this device.` : 'Your fragrances will stay safe here.'}/>
    {!items.length ? <EmptyState icon={<ShoppingBag/>} title="Your bag is ready" copy="Build a three-note formula and bottle your first original scent." action="Start building" onAction={onBuild}/> : <div className="bag-page-grid"><div className="bag-list">{items.map(item => <article className={`bag-item ${isPlaySet(item) ? 'bag-play-set' : ''}`} key={item.id}>
      {isPlaySet(item) ? <div className="play-set-mini"><b>3 ×</b><span>10 ML</span></div> : <MiniBottle blend={item.notes}/>}
      <div className="bag-item-info">
        {isPlaySet(item) ? <><span className="bundle-label">PLAY SET · Best for Exploring</span><h3>Three-blend discovery set</h3><ol>{item.blends.map((blend, index) => <li key={`${blendIdentity(blend)}-${index}`}>{blendName(blend)}</li>)}</ol></> : <h3>{blendName(item.notes)}</h3>}
        <div className="bag-controls">{!isPlaySet(item) ? <div className="size-mini">{([10, 30] as BottleSize[]).map(size => <button className={item.size === size ? 'active' : ''} onClick={() => onSize(item.id, size)} key={size}>{size} ml</button>)}</div> : <small>3 × 10 ml bundle</small>}<Quantity item={item} onQuantity={onQuantity}/></div>
        <div className="bag-price"><strong>{formatPrice(item.price * item.quantity)}</strong><button onClick={() => onRemove(item.id)}><Trash2 size={14}/> Remove</button></div>
      </div>
    </article>)}</div><aside className="bag-summary"><span>ORDER SUMMARY</span><div><p>Subtotal</p><strong>{formatPrice(total)}</strong></div><p>Shipping and taxes are calculated at checkout.</p><button onClick={onCheckout}>CHECKOUT</button><button className="make-another" onClick={onBuild}>MAKE ANOTHER BLEND</button><small>Review your order before payment.</small></aside></div>}
  </section>
}

export function OrdersScreen({ orders, onBuild }: { orders: TestOrder[]; onBuild: () => void }) {
  return <section className="app-screen"><ScreenTitle eyebrow="LOCAL PREVIEW" title="Orders" copy={orders.length ? `${orders.length} test order${orders.length === 1 ? '' : 's'} saved on this device.` : 'A preview of your locally saved orders.'}/><div className="order-list">{orders.length ? orders.map((order, index) => <article className="order-card order-card-detailed" key={order.id}><header><div><span>ORDER NUMBER</span><strong>{order.orderNumber ?? fallbackOrderNumber(order.createdAt, index)}</strong></div><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></header><div className="order-products">{order.items.map(item => <div key={item.id}><h3>{isPlaySet(item) ? 'PLAY SET — 3 × 10 ML' : blendName(item.notes)}</h3>{isPlaySet(item) ? <><span>QTY {item.quantity}</span>{item.blends.map((blend, blendIndex) => <small key={blendIndex}>{blendName(blend)}</small>)}</> : <span>{item.size} ML · QTY {item.quantity}</span>}</div>)}</div><footer><div><span>TOTAL</span><strong>{formatPrice(order.total)}</strong></div><b>{order.status ?? 'Payment Confirmed'}</b></footer></article>) : <article className="order-card order-card-detailed"><header><div><span>ORDER NUMBER</span><strong>PF-DEMO-001</strong></div><time>31 Aug 2026</time></header><div className="order-products"><div><h3>Yuzu · Matcha · Clean Musk</h3><span>30 ML · QTY 1</span></div></div><footer><div><span>TOTAL</span><strong>{formatPrice(224000)}</strong></div><b>Payment Confirmed</b></footer></article>}</div><p className="mock-note">Local prototype data only. No payment has been processed.</p>{!orders.length ? <button className="orders-build" onClick={onBuild}>MAKE YOUR FIRST BLEND</button> : null}</section>
}

const moreItems = [
  { label: 'How It Works', copy: 'From three notes to one original scent.', icon: CircleHelp },
  { label: 'FAQ', copy: 'Quick answers about blends and bottles.', icon: FileText },
  { label: 'Contact', copy: 'Say hello to the lab.', icon: Mail },
  { label: 'Terms', copy: 'The practical details.', icon: FileText },
  { label: 'Privacy', copy: 'How your local data is handled.', icon: ShieldCheck }
]

export function MoreScreen() {
  return <section className="app-screen"><ScreenTitle eyebrow="PERFUN LAB" title="More" copy="Useful things, kept simple."/><div className="more-list">{moreItems.map(({label, copy, icon: Icon}) => <button key={label} onClick={() => alert(`${label} content will be added before launch.`)}><i><Icon/></i><span><strong>{label}</strong><small>{copy}</small></span><ChevronRight/></button>)}</div><div className="app-signoff"><strong>PERFUN LAB</strong><span>Prototype v0.1 · Made for noses with opinions.</span></div></section>
}

function Quantity({ item, onQuantity }: { item: CartItem; onQuantity: BagProps['onQuantity'] }) { return <div className="quantity"><small>QTY</small><button onClick={() => onQuantity(item.id, item.quantity - 1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{item.quantity}</span><button onClick={() => onQuantity(item.id, item.quantity + 1)} aria-label="Increase quantity"><Plus size={13}/></button></div> }
function MiniBottle({ blend }: { blend: CompleteSelection }) { return <div className="mini-bottle"><div className="mini-cap"/><div className="mini-body"><div>{Object.values(blend).map(note => <i key={note.id} style={{background:note.stickerColor}}>{note.icon}</i>)}</div></div></div> }
function ScreenTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <header className="screen-title"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header> }
function EmptyState({ icon, title, copy, action, onAction }: { icon: React.ReactNode; title: string; copy: string; action: string; onAction: () => void }) { return <div className="screen-empty"><i>{icon}</i><h2>{title}</h2><p>{copy}</p><button onClick={onAction}>{action}</button></div> }
function blendName(blend: CompleteSelection) { return `${blend.top.name} · ${blend.middle.name} · ${blend.base.name}` }
function blendIdentity(blend: CompleteSelection) { return `${blend.top.id}-${blend.middle.id}-${blend.base.id}` }
function formatOrderDate(value: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) }
function fallbackOrderNumber(value: string, index: number) { return `PF-${value.slice(2, 10).replaceAll('-', '')}-${String(index + 1).padStart(3, '0')}` }
