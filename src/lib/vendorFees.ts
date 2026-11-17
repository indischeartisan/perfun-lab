import { requireSupabase } from './supabase'

export interface VendorFeeSettings {
  service_10ml: number
  service_30ml: number
  play_set: number
  updated_at: string
}

export async function getAdminVendorFeeSettings() {
  const { data, error } = await requireSupabase().rpc('admin_vendor_fee_settings')
  if (error) throw error
  return data as VendorFeeSettings
}

export async function updateAdminVendorFeeSettings(service10ml: number, service30ml: number) {
  const { data, error } = await requireSupabase().rpc('admin_update_vendor_fee_settings', {
    p_service_10ml: service10ml,
    p_service_30ml: service30ml,
  })
  if (error) throw error
  return data as VendorFeeSettings
}
