import { requireSupabase } from './supabase'
import type { FormulaSnapshot } from '../components/WorkspacePresentation'

export type TestRunStatus = 'order' | 'production' | 'packing' | 'shipping' | 'done'
export type TestAction = 'start' | 'complete' | 'pack' | 'ship'
export interface TestRun {
  id: string; vendor_id: string; customer_name: string; volume_ml: number; bottle_count: number
  quantity: number; formulas: FormulaSnapshot[]; status: TestRunStatus; created_at: string
  shipping: { courier: string; service: string; tracking: string; cost: number } | null
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args)
  if (error) throw error
  return data as T
}
export const testModeStatus = () => rpc<boolean>('test_mode_status')
export const listTestRuns = () => rpc<TestRun[]>('list_test_runs')
export function createTestRun(requestId: string, vendorId: string, customerName: string, volume: number, count: number, quantity: number, formulas: FormulaSnapshot[]) {
  return rpc<TestRun>('create_test_run', { p_request_id: requestId, p_vendor_id: vendorId, p_customer_name: customerName, p_volume_ml: volume, p_bottle_count: count, p_quantity: quantity, p_formulas: formulas })
}
export function advanceTestRun(id: string, requestId: string, action: TestAction, payload: Record<string, unknown>) {
  return rpc<TestRun>('advance_test_run', { p_run_id: id, p_request_id: requestId, p_action: action, p_payload: payload })
}
