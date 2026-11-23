type AdminOrderStatusInput = {
  payment_status: string
  shipment_status: string
  production_status: string
}

export function processAdminOrderStatus(order: AdminOrderStatusInput) {
  if (order.payment_status === 'pending') return 'Menunggu pembayaran'
  if (order.payment_status === 'expired') return 'Pembayaran kedaluwarsa'
  if (order.payment_status === 'failed') return 'Pembayaran gagal'
  if (order.payment_status === 'refunded') return 'Pembayaran dikembalikan'
  if (order.payment_status !== 'paid') return 'Pembayaran belum terkonfirmasi'
  if (order.shipment_status === 'delivered') return 'Selesai'
  if (order.shipment_status === 'shipped') return 'Sedang dikirim'
  if (order.shipment_status === 'ready_to_ship') return 'Siap dikirim'
  if (order.production_status === 'in_production') return 'Sedang diracik'
  if (order.production_status === 'queued') return 'Antrean produksi'
  return 'Menunggu diracik'
}
