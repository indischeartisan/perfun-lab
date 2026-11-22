import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  const page = await browser.newPage({ viewport })
  await page.goto('http://127.0.0.1:4176/payment-expiry-preview.html')
  await page.getByRole('timer').waitFor()
  assert.match(await page.getByRole('timer').textContent(), /Sisa waktu pembayaran/)
  await page.getByRole('button', { name: 'Bayar di DOKU' }).waitFor()
  await page.getByTestId('expire').click()
  await page.getByText('Batas pembayaran telah berakhir.', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Bayar di DOKU' }).count(), 0)
  await page.close()
}
await browser.close()
console.log('PASS: payment countdown and expired payment action are responsive on mobile and desktop')
