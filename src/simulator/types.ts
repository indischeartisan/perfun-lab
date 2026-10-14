import type { FormulaSnapshot } from '../components/WorkspacePresentation'

export type DemoPaymentStatus = 'pending' | 'paid'
export type DemoProductionStatus = 'unassigned' | 'queued' | 'in_production' | 'completed'
export type DemoFulfillmentStatus = 'waiting' | 'ready' | 'packed' | 'shipped'
export type DemoPayoutStatus = 'draft' | 'paid'

export type DemoItem = {
  id: string
  product: string
  volumeMl: number
  bottleCount: number
  quantity: number
  playSet?: boolean
  formulas: FormulaSnapshot[]
  production: Exclude<DemoProductionStatus, 'unassigned'>
}

export type DemoOrder = {
  id: string
  number: string
  createdAt: string
  customer: { name: string; phone: string; email: string; address: string; city: string; province: string; postalCode: string }
  items: DemoItem[]
  payment: DemoPaymentStatus
  production: DemoProductionStatus
  fulfillment: DemoFulfillmentStatus
  vendorId?: string
  courier?: string
  service?: string
  tracking?: string
  shippingCost?: number
  total: number
}

export type DemoPayout = { id: string; orderIds: string[]; vendorId: string; ratePerBottle: number; total: number; status: DemoPayoutStatus; reference?: string; createdAt: string }
export type DemoState = { orders: DemoOrder[]; payouts: DemoPayout[] }

export const demoVendor = { id: 'demo-vendor-01', name: 'Nara Atelier', ratePerBottle: 18000 }
