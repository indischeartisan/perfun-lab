import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
try {
  await page.goto(process.env.E2E_APP_URL ?? 'http://127.0.0.1:4174/shipping-address-e2e.html', { waitUntil: 'networkidle' })
  await page.getByTestId('e2e-auth').filter({ hasText: 'Authenticated local customer' }).waitFor({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Periksa lokasi pengiriman' }).click()
  await page.getByText('Wilayah tersimpan saat ini').waitFor()
  await page.getByText('Kecamatan Manual · Kota Manual · Provinsi Manual · 11111').waitFor()
  await page.getByRole('button', { name: 'Batal' }).click()

  await page.getByRole('button', { name: 'Tambah alamat' }).click()
  await page.getByLabel('Nama penerima').fill('Customer CI')
  await page.getByLabel('Nomor telepon').fill('081234567890')
  await page.getByLabel('Jalan dan detail rumah').fill('Jalan CI No. 1')
  await page.getByLabel('Label alamat').fill('Rumah CI')
  const search = page.getByPlaceholder('Kecamatan, kota, atau kode pos')
  await search.fill('Bandung')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Cibangkong/ }).click()
  await page.getByRole('button', { name: 'Simpan alamat' }).click()
  await page.getByRole('button', { name: 'Lihat layanan pengiriman' }).click()
  await page.getByRole('button', { name: /J&T Express EZ/ }).click()
  await page.getByTestId('review-checkout').click()
  await page.getByTestId('checkout-review').filter({ hasText: '"shipping":6000' }).waitFor()
  const javaQuote = await page.getByTestId('quote-id').textContent()

  await page.getByRole('button', { name: 'Ubah' }).last().click()
  await page.getByRole('button', { name: 'Ubah lokasi' }).click()
  await search.fill('Bali')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Dauh Puri/ }).click()
  await page.getByRole('button', { name: 'Simpan alamat' }).click()
  await page.getByRole('button', { name: 'Lihat layanan pengiriman' }).click()
  await page.getByRole('button', { name: /AnterAja REG/ }).click()
  await page.getByTestId('review-checkout').click()
  await page.getByTestId('checkout-review').filter({ hasText: '"shipping":23000' }).waitFor()

  const summary = { javaQuote, finalQuote: await page.getByTestId('quote-id').textContent(), addressCards: await page.locator('.address-card').count() }
  if (process.env.E2E_RESULT_FILE) writeFileSync(process.env.E2E_RESULT_FILE, JSON.stringify(summary))
  console.log('PASS: browser local Auth, destination save, J&T, AnterAja, voucher and checkout review')
} finally {
  await browser.close()
}
