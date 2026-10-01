import type { ProductChoice } from '../types'

export interface ProductOption {
  id: ProductChoice
  label: string
  description: string
  normalPrice: number
  openingPrice: number
  badge?: string
}

export const PROTOTYPE_SHIPPING = 25000
