import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const appUrl = process.env.E2E_APP_URL
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const screenshotDir = process.env.SCREENSHOT_DIR
assert.ok(appUrl && email && password && screenshotDir)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.on('response', async response => {
  if (!response.url().includes('/rest/v1/rpc/admin_finance')) return
  try {
    const body = await response.json()
    console.log(`admin_finance period=${body.period} orders=${body.orders?.orders} payments=${body.payments?.customer_payments} vendor_paid=${body.vendor?.paid_total}`)
  } catch { /* Playwright may observe a response while the page is closing. */ }
})

try {
  await page.goto(`${appUrl}/#admin`, { waitUntil: 'domcontentloaded' })
  await page.locator('summary[aria-label="Akun"]').click()
  await page.getByRole('button', { name: 'Masuk atau buat akun', exact: true }).click()
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'SIGN IN', exact: true }).click()
  await page.getByRole('heading', { name: 'Ringkasan', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Keuangan', exact: true }).click()
  await page.getByRole('heading', { name: 'Pembayaran pelanggan', exact: true }).waitFor()
  const rateSettings = page.getByRole('heading', { name: 'Atur tarif perfumer', exact: true })
  await rateSettings.waitFor()
  const financePayments = page.getByRole('heading', { name: 'Pembayaran perfumer', exact: true })
  assert.ok((await rateSettings.boundingBox()).y < (await financePayments.boundingBox()).y)

  const metric = async (label) => page.getByText(label, { exact: true }).locator('..').getByRole('strong').textContent()
  const assertMetrics = async () => {
    assert.equal(await metric('Jumlah pesanan'), '2')
    assert.equal(await metric('Total pembayaran pelanggan'), 'Rp325.000')
    assert.equal(await metric('Pembayaran tercatat pada periode ini'), 'Rp62.000')
  }

  await assertMetrics()
  await page.locator('summary', { hasText: 'Rincian per tanggal' }).click()
  await page.locator('.finance-table').waitFor()
  assert.equal(await page.locator('details[open] .finance-table tbody tr').count() > 0, true)
  await page.screenshot({ path: `${screenshotDir}/finance-all-time.png`, fullPage: true })

  await page.getByLabel('Periode').selectOption('custom')
  await page.getByLabel('Tanggal WIB').fill('2026-01-02')
  await page.getByRole('button', { name: 'Terapkan', exact: true }).click()
  assert.match((await page.locator('.finance-period-note').textContent()) ?? '', /2026/)
  await assertMetrics()
  await page.screenshot({ path: `${screenshotDir}/finance-wib-date.png`, fullPage: true })

  await page.getByRole('region', { name: 'Pembayaran perfumer', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Rekap pembayaran perfumer', exact: true }).waitFor()
  await page.getByLabel('Rekap periode').selectOption('week')
  await page.getByLabel('Rekap periode').selectOption('month')
  await page.getByLabel('Rekap periode').selectOption('day')
  assert.equal(await page.getByRole('button', { name: 'Buat draf pembayaran', exact: true }).count(), 0)
  assert.equal(await page.getByRole('alert').count(), 0)
  await page.screenshot({ path: `${screenshotDir}/finance-vendor-recap.png`, fullPage: true })
} catch (error) {
  await page.screenshot({ path: `${screenshotDir}/finance-failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
