export type Stage = 'order' | 'production' | 'ship' | 'done'
export type Formula = { top: string; middle: string; base: string }
export type Item = { id: string; name: string; volume: 10 | 30; quantity: number; playSet?: boolean; formulas: Formula[] }
export type Shipment = { courier: 'J&T' | 'Anteraja'; service: string; tracking: string; cost: number }
export type Order = { id: string; name: string; phone: string; address: string; province: string; created: string; stage: Stage; items: Item[]; shipment?: Shipment }
export type State = { orders: Order[]; payouts: Array<{ id: string; period: string; amount: number; status: string }> }

export const STORAGE_KEY = 'perfun-lab:vendor-simulator:isolated:v1'
export const JAVA_PROVINCES = ['Banten', 'DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur'] as const
export const courierForProvince = (province: string): Shipment['courier'] => JAVA_PROVINCES.some(value => value.toLowerCase() === province.trim().toLowerCase()) ? 'J&T' : 'Anteraja'
export const serviceForCourier = (courier: Shipment['courier']) => courier === 'J&T' ? 'Standard (simulasi)' : 'Regular (simulasi)'

const formulas: Formula[] = [
  { top: 'Yuzu', middle: 'Matcha', base: 'Clean Musk' },
  { top: 'Pink Pepper', middle: 'Peony', base: 'Sandalwood' },
  { top: 'Sea Breeze', middle: 'Jasmine', base: 'Amber' },
]
const single = (id: string, volume: 10 | 30, index: number): Item => ({ id, name: 'Eau de Parfum', volume, quantity: 1, formulas: [formulas[index % formulas.length]] })
const play: Item = { id: 'play', name: 'Play Set', volume: 10, quantity: 1, playSet: true, formulas }
const base = (id: string, name: string, province: string, stage: Stage, items: Item[]): Order => ({
  id, name, province, stage, items, created: '2026-10-01',
  phone: '+62 000 0000 ' + id.slice(-4),
  address: 'Alamat fiktif ' + id + ', Kota Contoh, ' + province,
})

export function initialState(): State {
  return {
    orders: [
      base('DEMO-1001', 'Nara Contoh', 'Jawa Barat', 'order', [single('a', 10, 0)]),
      base('DEMO-1002', 'Bima Contoh', 'Bali', 'order', [play]),
      base('DEMO-1003', 'Citra Contoh', 'Jawa Tengah', 'production', [single('b', 30, 1)]),
      base('DEMO-1004', 'Damar Contoh', 'DKI Jakarta', 'ship', [single('c', 10, 2), single('d', 30, 1)]),
      base('DEMO-1005', 'Eka Contoh', 'Sulawesi Selatan', 'ship', [single('e', 30, 0)]),
      { ...base('DEMO-1006', 'Fajar Contoh', 'Banten', 'done', [single('f', 10, 1)]), shipment: { courier: 'J&T', service: 'Standard (simulasi)', tracking: 'DEMO-RESI-1006', cost: 12000 } },
    ],
    payouts: [{ id: 'DEMO-PAY-01', period: 'Periode simulasi', amount: 54000, status: 'Paid (demo)' }],
  }
}

export function advanceOrder(state: State, id: string, from: 'order' | 'production'): State {
  return { ...state, orders: state.orders.map(order => order.id === id && order.stage === from ? { ...order, stage: from === 'order' ? 'production' : 'ship' } : order) }
}
export function validShipment(order: Order, shipment: Shipment): boolean {
  return order.stage === 'ship' && shipment.courier === courierForProvince(order.province) && shipment.service === serviceForCourier(shipment.courier) && !!shipment.tracking.trim() && Number.isFinite(shipment.cost) && shipment.cost > 0
}
export function shipOrder(state: State, id: string, shipment: Shipment): State {
  return { ...state, orders: state.orders.map(order => order.id === id && validShipment(order, shipment) ? { ...order, stage: 'done', shipment: { ...shipment, tracking: shipment.tracking.trim() } } : order) }
}
export function addressText(order: Order) { return [order.name, order.phone, order.address].join('\n') }
export function orderText(order: Order) {
  return [order.id, addressText(order), ...order.items.flatMap(item => item.formulas.map((formula, index) => item.name + ' Botol ' + (index + 1) + ' · ' + item.volume + ' ml\nTop: ' + formula.top + '; Middle: ' + formula.middle + '; Base: ' + formula.base))].join('\n\n')
}
export function loadState(): State {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw) as State } catch { /* Reset to synthetic seed if browser storage is unavailable. */ }
  return initialState()
}
export function saveState(state: State) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* The simulation remains in memory if storage is unavailable. */ } }
