import { chromium } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:5177'

const browser = await chromium.launch({ headless: false, slowMo: 200 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

// Login
await page.goto(`${BASE}/login`)
await page.waitForTimeout(800)
await page.locator('input[type="text"]').fill('admin')
await page.locator('input[type="password"]').fill('12345678')
await page.locator('button[type="submit"]:has-text("Login")').click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// Wait for sidebar nav to be visible (confirms auth + role loaded)
await page.waitForSelector('nav', { state: 'visible', timeout: 10000 })
await page.waitForTimeout(500)
console.log('Logged in, sidebar visible')

// Screenshot design-system
await page.click('a[href="/design-system"], nav a[href*="design"]')
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(__dirname, 'pw-design-system.png'), fullPage: true })
console.log('Screenshot design-system saved')

// Screenshot dynamic-forms
await page.goto(`${BASE}/admin/dynamic-forms`)
await page.waitForSelector('nav', { state: 'visible', timeout: 10000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(__dirname, 'pw-dynamic-forms.png'), fullPage: true })
console.log('Screenshot dynamic-forms saved')

await browser.close()
