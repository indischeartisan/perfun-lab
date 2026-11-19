import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const appUrl = process.env.E2E_APP_URL
const email = process.env.E2E_EMAIL
const vendorEmail = process.env.E2E_VENDOR_EMAIL
const password = process.env.E2E_PASSWORD
const screenshotDir = process.env.SCREENSHOT_DIR
assert.ok(appUrl && email && vendorEmail && password && screenshotDir)

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
  const rateSettings = page.getByText('Atur tarif', { exact: true })
  await rateSettings.waitFor()
  const financePayments = page.getByRole('heading', { name: 'Pembayaran perfumer', exact: true })
  const rateBox = await rateSettings.boundingBox()
  const financeBox = await financePayments.boundingBox()
  assert.ok(rateBox && financeBox && rateBox.y <= financeBox.y + financeBox.height)

  const metric = async (section, label) => page.locator('.finance-section').filter({
    has: page.getByRole('heading', { name: section, exact: true }),
  }).getByText(label, { exact: true }).locator('..').getByRole('strong').textContent()
  const assertMetrics = async (orders, customerPayments) => {
    assert.equal(await metric('Pesanan', 'Jumlah pesanan'), orders)
    assert.equal(await metric('Pembayaran pelanggan', 'Total pembayaran pelanggan'), customerPayments)
  }

  await assertMetrics('5', 'Rp1.305.000')
  await page.locator('summary', { hasText: 'Rincian per tanggal' }).click()
  await page.locator('.finance-table').waitFor()
  assert.equal(await page.locator('details[open] .finance-table tbody tr').count() > 0, true)
  await page.screenshot({ path: `${screenshotDir}/finance-all-time.png`, fullPage: true })

  await page.locator('.finance-period-filter select').selectOption('custom')
  await page.getByLabel('Tanggal WIB').fill('2026-01-02')
  await page.getByRole('button', { name: 'Terapkan', exact: true }).click()
  assert.match((await page.locator('.finance-page > .finance-period-note').textContent()) ?? '', /2026/)
  await assertMetrics('2', 'Rp325.000')
  await page.screenshot({ path: `${screenshotDir}/finance-wib-date.png`, fullPage: true })

  await page.getByRole('region', { name: 'Pembayaran perfumer', exact: true }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Pembayaran perfumer', exact: true }).count(), 1)
  assert.equal(await page.getByLabel('Jasa 10 ml').getAttribute('step'), '1')
  assert.equal(await page.getByLabel('Jasa 30 ml').getAttribute('step'), '1')
  const payoutRegion = page.getByRole('region', { name: 'Pembayaran perfumer', exact: true })
  await page.getByLabel('Rekap periode').selectOption('week')
  await payoutRegion.locator('.finance-period-note').getByText('Mingguan (WIB)', { exact: false }).waitFor()
  await page.getByLabel('Rekap periode').selectOption('month')
  await payoutRegion.locator('.finance-period-note').getByText('Bulanan (WIB)', { exact: false }).waitFor()
  await page.getByLabel('Rekap periode').selectOption('day')
  assert.equal(await page.getByRole('button', { name: 'Buat draf pembayaran', exact: true }).count(), 0)
  assert.equal(await page.getByRole('alert').count(), 0)
  await page.screenshot({ path: `${screenshotDir}/finance-vendor-recap.png`, fullPage: true })

  const vendorPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  await vendorPage.goto(`${appUrl}/#payouts`, { waitUntil: 'domcontentloaded' })
  await vendorPage.locator('summary[aria-label="Akun"]').click()
  await vendorPage.getByRole('button', { name: 'Masuk atau buat akun', exact: true }).click()
  await vendorPage.getByLabel('Email address').fill(vendorEmail)
  await vendorPage.getByLabel('Password', { exact: true }).fill(password)
  await vendorPage.getByRole('button', { name: 'SIGN IN', exact: true }).click()
  await vendorPage.getByRole('heading', { name: 'Pembayaran', exact: true }).waitFor()
  const vendorRecap = vendorPage.locator('.vendor-payments-page')
  assert.ok((await vendorRecap.boundingBox())?.width && (await vendorRecap.boundingBox()).width > 1000)
  assert.equal(await vendorPage.getByRole('button', { name: 'Pembayaran', exact: true }).count(), 1)
  assert.equal(await vendorPage.getByText('Rp980.000', { exact: true }).count(), 1)
  const desktopMetricBoxes = await vendorRecap.locator('.admin-metrics article').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y) } }))
  assert.equal(desktopMetricBoxes.length, 4)
  assert.equal(new Set(desktopMetricBoxes.map(box => box.y)).size, 1)
  await vendorPage.getByText('Pesanan yang perlu dibayar', { exact: true }).click()
  await vendorPage.getByText('Produk: Blend 30 ml × 1 · Blend 10 ml × 2', { exact: true }).waitFor()
  await vendorPage.getByText('Produk: Play Set (3 × 10 ml) × 1', { exact: true }).waitFor()
  assert.equal(await vendorPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await vendorPage.screenshot({ path: `${screenshotDir}/vendor-payout-desktop-open.png`, fullPage: true })

  const vendorMobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await vendorMobile.goto(`${appUrl}/#payouts`, { waitUntil: 'domcontentloaded' })
  await vendorMobile.getByRole('heading', { name: 'Pembayaran', exact: true }).waitFor()
  await vendorMobile.getByText('Pesanan yang perlu dibayar', { exact: true }).click()
  await vendorMobile.getByText('Produk: Play Set (3 × 10 ml) × 1', { exact: true }).waitFor()
  const mobileMetricBoxes = await vendorMobile.locator('.vendor-payments-page .admin-metrics article').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { y: Math.round(box.y), right: Math.round(box.right) } }))
  assert.equal(mobileMetricBoxes.length, 4)
  assert.equal(new Set(mobileMetricBoxes.map(box => box.y)).size, 4)
  assert.equal(mobileMetricBoxes.every(box => box.right <= 390), true)
  assert.equal(await vendorMobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await vendorMobile.screenshot({ path: `${screenshotDir}/vendor-payout-mobile-open.png`, fullPage: true })
} catch (error) {
  await page.screenshot({ path: `${screenshotDir}/finance-failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
