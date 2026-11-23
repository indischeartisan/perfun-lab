export function paymentDeadlineState(deadline: string, now = Date.now()) {
  const remainingSeconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
  return { expired: remainingSeconds <= 0, remainingSeconds }
}

export function formatPaymentCountdown(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  return [hours, minutes, remaining].map(value => String(value).padStart(2, '0')).join(':')
}
