import type { OrderIntent } from './orders'
import { requireSupabase } from './supabase'
export { quoteExpired } from './shippingQuoteState'

export interface ShippingDestination { id: number; label: { name: string; city?: string | null; district?: string | null; province?: string | null; postal_code?: string | null } }
export interface ShippingRate { courier_code: string; courier_name: string; service: string; amount: number; etd: string }
export interface ShippingQuote { quote_id: string; courier_code: string; courier_name: string; service: string; amount: number; etd: string; weight_grams: number; origin_version: number; package_profile_version: number; expires_at: string }

async function invoke<T>(name: 'shipping-destinations' | 'shipping-quote', body: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke(name, { body })
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      try { const message = await error.context.json(); if (typeof message?.error === 'string') throw new Error(message.error) } catch (cause) { if (cause instanceof Error) throw cause }
    }
    throw error
  }
  if (!data || typeof data !== 'object' || 'error' in data) throw new Error(typeof data?.error === 'string' ? data.error : 'Shipping service is unavailable. Please try again.')
  return data as T
}
export async function searchShippingDestinations(query: string) { return (await invoke<{ destinations: ShippingDestination[] }>('shipping-destinations', { action: 'search', query })).destinations }
export async function bindShippingDestination(addressId: string, query: string, destinationId: number) { await invoke('shipping-destinations', { action: 'bind', address_id: addressId, query, destination_id: destinationId }) }
export async function shippingRates(addressId: string, items: OrderIntent[], courier: string) { return (await invoke<{ rates: ShippingRate[] }>('shipping-quote', { address_id: addressId, items, courier })).rates }
export async function selectShippingRate(addressId: string, items: OrderIntent[], courier: string, service: string) { return (await invoke<{ quote: ShippingQuote }>('shipping-quote', { address_id: addressId, items, courier, service })).quote }
