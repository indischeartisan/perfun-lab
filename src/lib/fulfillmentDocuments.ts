import type { Shipment, ShipmentFormulaJob } from './shipments'

type SnapshotItem = Shipment['items_snapshot'][number]

function text(value: string | null | undefined) { return value?.trim() ?? '' }
function escapeHtml(value: string | null | undefined) { return text(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!) }

function addressLines(shipment: Shipment) {
  const address = shipment.address_snapshot
  const locality = [address.district, address.city, address.province, address.postal_code].map(text).filter(Boolean).join(', ')
  return [text(address.recipient_name), text(address.phone), text(address.address_line), locality, text(address.delivery_note) ? `Note: ${text(address.delivery_note)}` : ''].filter(Boolean)
}
function itemLine(item: SnapshotItem) { return `${item.product.label} — ${item.product.bottle_count} × ${item.product.volume_ml} ml · Quantity: ${item.quantity}` }
function formulaLines(jobs: ShipmentFormulaJob[]) {
  if (!jobs.length) return ['Formula snapshot unavailable. Check the Production workspace.']
  return jobs.flatMap(job => [
    `${job.product_snapshot.label} — ${job.product_snapshot.bottle_count} × ${job.product_snapshot.volume_ml} ml · Quantity: ${job.quantity}`,
    ...(job.formulas_snapshot.length ? job.formulas_snapshot.map((formula, index) => `Bottle ${index + 1}: Top ${formula.top ?? '—'} · Middle ${formula.middle ?? '—'} · Base ${formula.base ?? '—'}`) : ['Formula snapshot unavailable.']),
  ])
}

export function formatShippingAddress(shipment: Shipment) { return addressLines(shipment).join('\n') }
export function formatOrderCopy(shipment: Shipment, jobs: ShipmentFormulaJob[]) {
  return [`Order: ${shipment.order_number}`, '', 'Items:', ...shipment.items_snapshot.map(itemLine), '', 'Formula:', ...formulaLines(jobs), shipment.address_snapshot.delivery_note ? `\nDelivery instruction: ${text(shipment.address_snapshot.delivery_note)}` : ''].filter(Boolean).join('\n')
}

function printShell(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>@page{size:A6 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#252a24;background:#fff;font-family:Arial,sans-serif;font-size:10pt;line-height:1.35}.sheet{width:100%}.eyebrow{font-size:7pt;letter-spacing:.14em;font-weight:700;color:#66701e}.title{margin:3mm 0 4mm;font-size:17pt;letter-spacing:-.03em}.order{padding:3mm 0;border-top:1px solid #252a24;border-bottom:1px solid #252a24;font-size:9pt;font-weight:700}.block{padding:3mm 0;border-bottom:1px solid #d7d4ca}.block h2{font-size:8pt;letter-spacing:.08em;text-transform:uppercase;margin:0 0 2mm}.block p,.block ul{margin:0}.block ul{padding-left:4mm}.formula{margin:2mm 0 0;padding:2mm;background:#f4f2e8}.muted{color:#5e605b}@media print{body{background:#fff}.no-print{display:none!important}}</style></head><body><main class="sheet">${body}</main></body></html>`
}

export function labelPrintHtml(shipment: Shipment) {
  const address = shipment.address_snapshot
  const courier = [text(shipment.courier), text(shipment.service)].filter(Boolean).join(' / ') || 'Shipping service pending'
  const tracking = text(shipment.tracking_number) || 'Tracking number pending'
  return printShell(`Shipping label ${shipment.order_number}`, `<p class="eyebrow">PERFUN LAB · SHIPPING LABEL</p><h1 class="title">${escapeHtml(shipment.order_number)}</h1><p class="order">${escapeHtml(courier)}<br>${escapeHtml(tracking)}</p><section class="block"><h2>Recipient</h2><p><strong>${escapeHtml(address.recipient_name)}</strong><br>${escapeHtml(address.phone)}</p></section><section class="block"><h2>Delivery address</h2><p>${addressLines(shipment).slice(2).map(escapeHtml).join('<br>')}</p></section>`)
}

export function packingSlipPrintHtml(shipment: Shipment, jobs: ShipmentFormulaJob[]) {
  const itemMarkup = shipment.items_snapshot.map(item => `<li>${escapeHtml(itemLine(item))}</li>`).join('') || '<li>No item snapshot available.</li>'
  const formulaMarkup = jobs.length ? jobs.map(job => `<div class="formula"><strong>${escapeHtml(`${job.product_snapshot.label} — ${job.product_snapshot.bottle_count} × ${job.product_snapshot.volume_ml} ml · Quantity: ${job.quantity}`)}</strong>${job.formulas_snapshot.length ? job.formulas_snapshot.map((formula, index) => `<p>Bottle ${index + 1}: Top ${escapeHtml(formula.top ?? '—')} · Middle ${escapeHtml(formula.middle ?? '—')} · Base ${escapeHtml(formula.base ?? '—')}</p>`).join('') : '<p>Formula snapshot unavailable.</p>'}</div>`).join('') : '<p class="muted">Formula snapshot unavailable. Check the Production workspace.</p>'
  return printShell(`Packing slip ${shipment.order_number}`, `<p class="eyebrow">PERFUN LAB · PACKING SLIP</p><h1 class="title">${escapeHtml(shipment.order_number)}</h1><p class="order">${escapeHtml(shipment.status.replaceAll('_', ' '))}</p><section class="block"><h2>Items</h2><ul>${itemMarkup}</ul></section><section class="block"><h2>Formula</h2>${formulaMarkup}</section><section class="block"><h2>Delivery instruction</h2><p>${escapeHtml(text(shipment.address_snapshot.delivery_note) || 'None')}</p></section>`)
}
