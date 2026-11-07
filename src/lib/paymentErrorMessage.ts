const unavailable = 'Layanan pembayaran belum dapat dihubungi. Coba lagi beberapa saat.'

export function paymentErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause ?? '')
  const normalized = message.toLowerCase()
  if (normalized.includes('not configured') || normalized.includes('invalid payment return') || normalized.includes('invalid notification')) return 'Pembayaran belum siap. Silakan hubungi Perfun Lab.'
  if (normalized.includes('sign in') || normalized.includes('invalid session')) return 'Sesi Anda sudah berakhir. Silakan masuk lagi untuk melanjutkan.'
  if (normalized.includes('order not found')) return 'Pesanan tidak ditemukan. Muat ulang daftar pesanan Anda.'
  if (normalized.includes('payment status changed')) return 'Status pembayaran berubah. Muat ulang pesanan Anda terlebih dahulu.'
  if (normalized.includes('payment') || normalized.includes('provider') || normalized.includes('network') || normalized.includes('failed to fetch')) return unavailable
  return unavailable
}
