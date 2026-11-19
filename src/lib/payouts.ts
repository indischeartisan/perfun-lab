import { requireSupabase } from './supabase'

export type PayoutStatus = 'draft' | 'paid' | 'void'
export interface PayoutItem { id: string; order_id: string; order_number: string; vendor_fee_amount: number; shipping_reimbursement: number; total_amount: number; status: 'reserved' | 'paid' | 'void' }
export interface VendorPayout { id: string; vendor_id: string; vendor: { name: string | null; email: string | null }; payout_date: string; status: PayoutStatus; total: number; transfer_reference: string | null; paid_at: string | null; paid_by: string | null; request_id: string; void_reason: string | null; voided_at: string | null; voided_by: string | null; created_at: string; items: PayoutItem[] }
export interface EligiblePayoutOrder { order_id: string; order_number: string; vendor_id: string; vendor: { name: string | null; email: string | null }; vendor_fee_amount: number; shipping_reimbursement: number; total_amount: number; shipping_payer: 'vendor' | 'perfun' | 'customer'; original_shipping_amount: number | null; shipped_at: string }
export interface ReviewPayoutOrder { order_id: string; order_number: string; vendor_id: string; vendor: { name: string | null; email: string | null }; vendor_fee_amount: number; shipping_payer: 'vendor' | 'perfun' | 'customer' | null; review_reason: string; shipped_at: string }
export interface AdminPayoutWorkspace { today: string; outstanding_service: number; outstanding_shipping: number; outstanding_total: number; eligible_count: number; review_count: number; eligible_orders: EligiblePayoutOrder[]; review_orders: ReviewPayoutOrder[]; payouts: VendorPayout[]; payout_count: number }
export interface VendorPayoutDashboard { today: string; earned_today: number; unpaid_total: number; paid_total: number; payouts: VendorPayout[]; count: number }
export type PayoutRecapPeriod = 'day' | 'week' | 'month'
export interface PayoutRecapOrder extends Omit<EligiblePayoutOrder, 'shipping_reimbursement' | 'total_amount' | 'shipping_payer' | 'shipped_at'> { shipping_reimbursement: number | null; total_amount: number | null; payment_paid_at: string; payment_date: string }
export interface PayoutRecapReviewOrder { order_id: string; order_number: string; vendor_id?: string; vendor?: { name: string | null; email: string | null }; vendor_fee_amount?: number; review_reason: string; payment_paid_at: string; payment_date: string }
export interface PayoutRecap { today: string; period: PayoutRecapPeriod; anchor_date: string; period_start: string; period_end: string; paid_count: number; paid_service: number; paid_shipping: number; paid_total: number; shipping_missing_count: number; all_paid_count: number; all_paid_total: number; all_shipping_missing_count: number; older_count: number; older_total: number; unassigned_count: number; paid_orders: PayoutRecapOrder[]; older_orders: PayoutRecapOrder[]; shipping_missing_orders: PayoutRecapReviewOrder[]; unassigned_orders: PayoutRecapReviewOrder[]; payouts: VendorPayout[] }

async function rpc<T>(name: string, args = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args)
  if (error) throw error
  return data as T
}
export const getAdminPayoutWorkspace = (page: number) => rpc<AdminPayoutWorkspace>('admin_vendor_payout_workspace', { p_page: page })
export const createVendorPayout = (vendorId: string, requestId: string) => rpc<VendorPayout>('admin_create_vendor_payout', { p_vendor_id: vendorId, p_request_id: requestId, p_payout_date: null })
export const markVendorPayoutPaid = (payoutId: string, reference: string) => rpc<VendorPayout>('admin_mark_vendor_payout_paid', { p_payout_id: payoutId, p_transfer_reference: reference })
export const voidVendorPayout = (payoutId: string, reason: string) => rpc<VendorPayout>('admin_void_vendor_payout', { p_payout_id: payoutId, p_reason: reason })
export const getVendorPayoutDashboard = (page: number) => rpc<VendorPayoutDashboard>('vendor_payout_dashboard', { p_page: page })
export const getAdminPayoutRecap = (period: PayoutRecapPeriod) => rpc<PayoutRecap>('admin_vendor_payout_recap', { p_period: period, p_anchor_date: null })
export const getVendorPayoutRecap = (period: PayoutRecapPeriod) => rpc<PayoutRecap>('vendor_payout_recap', { p_period: period, p_anchor_date: null })
