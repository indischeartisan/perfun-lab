import type { PackingChecklist } from './shipments'

// Only an explicit confirmation is allowed to produce a completed checklist.
export function confirmedPackingChecklist(confirmed: boolean): PackingChecklist | null {
  if (!confirmed) return null
  return { bottles_checked: true, formula_stickers_checked: true, bottles_sealed: true, packaging_ready: true, recipient_label_checked: true }
}
