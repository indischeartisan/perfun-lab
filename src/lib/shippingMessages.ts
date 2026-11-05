export function shippingErrorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (/failed to send a request to the edge function/i.test(message)) return 'Tidak dapat terhubung ke layanan pencarian lokasi. Coba lagi; jika berlanjut, konfigurasi preview perlu diperiksa.'
  if (/shipping is not configured yet/i.test(message)) return 'Pencarian lokasi belum tersedia pada lingkungan ini. Layanan alamat perlu diperbarui terlebih dahulu.'
  if (/sign in required|invalid session/i.test(message)) return 'Sesi Anda berakhir. Masuk kembali lalu coba lagi.'
  if (/customer account required/i.test(message)) return 'Akun pelanggan diperlukan untuk mencari lokasi.'
  if (/shipping provider is unavailable|shipping destination search is unavailable/i.test(message)) return 'Layanan RajaOngkir sedang tidak tersedia. Coba lagi beberapa saat lagi.'
  if (/rate limit|too many|membatasi permintaan/i.test(message)) return 'Terlalu banyak permintaan pencarian. Coba lagi beberapa saat lagi.'
  return message || 'Pencarian lokasi tidak dapat dilakukan. Coba lagi.'
}
