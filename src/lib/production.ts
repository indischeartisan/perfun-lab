import { requireSupabase } from './supabase'

export type ProductionStatus = 'queued' | 'in_production' | 'completed'
export interface ProductionJob {
  id: string; order_item_id: string; status: ProductionStatus; assigned_to: string | null
  started_at: string | null; completed_at: string | null; created_at: string; updated_at: string
  order_number: string; ordered_at: string; quantity: number; production_allowed: boolean
  product_snapshot: { label: string; volume_ml: number; bottle_count: number }
  formulas_snapshot: Array<{ top: string | null; middle: string | null; base: string | null }>
}

export async function listProductionJobs(status: ProductionStatus, page: number) {
  const { data, error, count } = await requireSupabase().from('production_jobs').select('*', { count: 'exact' })
    .eq('status', status).order('ordered_at').order('id').range(page * 25, page * 25 + 24)
  if (error) throw error
  return { jobs: data as ProductionJob[], count: count ?? 0 }
}

export async function advanceProductionJob(id: string, action: 'start' | 'complete') {
  const { data, error } = await requireSupabase().rpc('advance_production_job', { p_job_id: id, p_action: action })
  if (error) throw error
  return data as ProductionJob
}
