import type { DemoItem, DemoOrder, DemoPayout, DemoState, DemoProductionStatus } from './types'

export const SIMULATOR_STORAGE_KEY = 'perfun-lab:operations-simulator:v1.1'
const now = '2026-10-14T09:30:00.000Z'
const formulas = [{ top: 'Yuzu', middle: 'Matcha', base: 'Clean Musk' }, { top: 'Pink Pepper', middle: 'Peony', base: 'Sandalwood' }, { top: 'Sea Breeze', middle: 'Jasmine', base: 'Amber' }, { top: 'Mint', middle: 'Green Leaves', base: 'Vanilla' }]
const names = ['Alya Prameswari', 'Bagas Mahendra', 'Celine Arta', 'Dion Pratama', 'Eka Wulandari', 'Farhan Putra']
const address = (index: number) => ({ name: names[index], phone: `0812-5550-10${index}`, email: `demo${index + 1}@example.test`, address: `Jl. Anggrek Demo No. ${12 + index}`, city: index % 2 ? 'Jakarta Selatan' : 'Bandung', province: index % 2 ? 'DKI Jakarta' : 'Jawa Barat', postalCode: index % 2 ? '12190' : '40123' })
const item = (id: string, product: string, volumeMl: number, bottleCount: number, quantity: number, formulaIndex: number, playSet = false): DemoItem => ({ id, product, volumeMl, bottleCount, quantity, playSet, formulas: Array.from({ length: bottleCount * quantity }, (_, index) => formulas[(formulaIndex + index) % formulas.length]), production: 'queued' })

export function orderProduction(order: Pick<DemoOrder, 'items' | 'production'>): DemoProductionStatus {
  if (order.production === 'unassigned') return 'unassigned'
  const jobs = order.items.map(value => value.production)
  if (jobs.every(status => status === 'completed')) return 'completed'
  if (jobs.some(status => status === 'in_production')) return 'in_production'
  return 'queued'
}
export function syncOrder(order: DemoOrder): DemoOrder { const production = orderProduction(order); return { ...order, production, fulfillment: production === 'completed' && order.fulfillment === 'waiting' ? 'ready' : order.fulfillment } }

export const initialDemoState = (): DemoState => ({ orders: [
  { id: 'demo-1028', number: 'DEMO-1028', createdAt: now, customer: address(0), items: [item('i-1', 'Eau de Parfum', 10, 1, 1, 0)], payment: 'pending', production: 'unassigned', fulfillment: 'waiting', total: 199000 },
  { id: 'demo-1027', number: 'DEMO-1027', createdAt: now, customer: address(1), items: [item('i-2', 'Eau de Parfum', 30, 1, 2, 1)], payment: 'paid', production: 'unassigned', fulfillment: 'waiting', total: 598000 },
  { id: 'demo-1026', number: 'DEMO-1026', createdAt: now, customer: address(2), items: [item('i-3', 'Play Set', 10, 3, 1, 2, true)], payment: 'paid', production: 'queued', fulfillment: 'waiting', vendorId: 'demo-vendor-01', total: 499000 },
  { id: 'demo-1025', number: 'DEMO-1025', createdAt: now, customer: address(3), items: [{ ...item('i-4', 'Eau de Parfum', 30, 1, 1, 3), production: 'in_production' }], payment: 'paid', production: 'in_production', fulfillment: 'waiting', vendorId: 'demo-vendor-01', total: 299000 },
  { id: 'demo-1024', number: 'DEMO-1024', createdAt: now, customer: address(4), items: [{ ...item('i-5', 'Eau de Parfum', 10, 1, 3, 0), production: 'completed' }], payment: 'paid', production: 'completed', fulfillment: 'ready', vendorId: 'demo-vendor-01', total: 597000 },
  { id: 'demo-1023', number: 'DEMO-1023', createdAt: now, customer: address(5), items: [{ ...item('i-6', 'Eau de Parfum', 10, 1, 1, 1), production: 'completed' }, { ...item('i-7', 'Eau de Parfum', 30, 1, 1, 3), production: 'completed' }], payment: 'paid', production: 'completed', fulfillment: 'ready', vendorId: 'demo-vendor-01', courier: 'JNE', service: 'REG', tracking: 'DEMOJNE1023', shippingCost: 18000, total: 498000 },
], payouts: [] })

export function loadDemoState(): DemoState { try { const value = globalThis.localStorage?.getItem(SIMULATOR_STORAGE_KEY); if (value) return JSON.parse(value) as DemoState } catch { /* fall back */ } return initialDemoState() }
export function saveDemoState(state: DemoState) { globalThis.localStorage?.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(state)) }
export function itemBottleTotal(order: DemoOrder) { return order.items.reduce((sum, value) => sum + value.bottleCount * value.quantity, 0) }
export function demoAddress(order: DemoOrder) { const c = order.customer; return `${c.name}\n${c.phone}\n${c.address}\n${c.city}, ${c.province} ${c.postalCode}` }
export function demoOrderText(order: DemoOrder) { return `${order.number}\n${demoAddress(order)}\n\n${order.items.flatMap(entry => entry.formulas.map((formula, index) => `${entry.product} — Botol ${index + 1}: ${entry.volumeMl} ml\nTop: ${formula.top}; Middle: ${formula.middle}; Base: ${formula.base}`)).join('\n\n')}` }
export function canTransition(order: DemoOrder, action: 'pay' | 'assign' | 'start' | 'complete' | 'ship') {
  if (action === 'pay') return order.payment === 'pending'
  if (action === 'assign') return order.payment === 'paid' && order.production === 'unassigned'
  if (action === 'start') return order.items.some(entry => entry.production === 'queued')
  if (action === 'complete') return order.items.some(entry => entry.production === 'in_production')
  return order.fulfillment === 'ready' && Boolean(order.courier && order.service && order.tracking && order.shippingCost)
}
export function createDemoOrder(state: DemoState, input: { name: string; phone: string; address: string; city: string; province: string; postalCode: string; item: DemoItem }) { const sequence = 1029 + state.orders.length; const order: DemoOrder = { id: `demo-${sequence}`, number: `DEMO-${sequence}`, createdAt: new Date().toISOString(), customer: { name: input.name, phone: input.phone, email: `order-${sequence}@example.test`, address: input.address, city: input.city, province: input.province, postalCode: input.postalCode }, items: [input.item], payment: 'pending', production: 'unassigned', fulfillment: 'waiting', total: input.item.quantity * (input.item.playSet ? 499000 : input.item.volumeMl === 30 ? 299000 : 199000) }; return { ...state, orders: [order, ...state.orders] } }
export function makePayout(state: DemoState, orderIds: string[], ratePerBottle: number, reference?: string): DemoState { const eligible = state.orders.filter(order => orderIds.includes(order.id) && order.production === 'completed' && order.vendorId); if (!eligible.length) return state; const id = `DEMO-PAY-${String(state.payouts.length + 1).padStart(3, '0')}`; const payout: DemoPayout = { id, orderIds: eligible.map(value => value.id), vendorId: 'demo-vendor-01', ratePerBottle, total: eligible.reduce((sum, order) => sum + itemBottleTotal(order) * ratePerBottle, 0), status: reference ? 'paid' : 'draft', reference, createdAt: new Date().toISOString() }; return { ...state, payouts: [payout, ...state.payouts] } }
