// Drives the running app in headless Chromium: reports console errors and saves screenshots.
// Usage: node scripts/browser-check.mjs [url] [outDir]     (CHROME_PATH overrides the browser)
import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5183/'
const out = process.argv[3] ?? 'screenshots'
const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const executablePath = candidates.find((p) => existsSync(p))
if (!executablePath) throw new Error('No Chrome/Chromium found; set CHROME_PATH')
await mkdir(out, { recursive: true })

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1500,950'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1 })
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => page.screenshot({ path: path.join(out, name + '.png') })
const clickText = async (selector, text) => {
  const ok = await page.evaluate(
    (selector, text) => {
      const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.trim().startsWith(text))
      if (el) el.click()
      return !!el
    },
    selector,
    text,
  )
  if (!ok) problems.push(`[check] could not find ${selector} "${text}"`)
  await sleep(250)
}
const text = (sel) => page.evaluate((sel) => document.querySelector(sel)?.textContent ?? null, sel)

await page.evaluateOnNewDocument(() => localStorage.clear())
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForSelector('.dashboard', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.dashboard.busy'), { timeout: 60000 })
await sleep(2500)
const report = {}
report.headline = await text('.headline')
report.dashboard = await page.evaluate(() => [...document.querySelectorAll('.stat')].map((s) => s.querySelector('.stat-label').childNodes[0].textContent + ': ' + s.querySelector('.stat-value').textContent + ' | ' + (s.querySelector('.stat-sub')?.textContent ?? '')))
report.cost = await page.evaluate(() => [...document.querySelectorAll('.stat')].find((s) => s.textContent.includes('Roční náklady'))?.innerText.replace(/\s+/g, ' '))
await shot('01-default')

// place the emergency by clicking the map
const box = await (await page.$('.map')).boundingBox()
await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.42)
await sleep(700)
report.afterClick = await text('.headline')
await shot('02-after-map-click')

// playback
await clickText('.playback .btn', '▶')
await sleep(2500)
await shot('03-playback')
await clickText('.playback .btn', '❚❚')

await clickText('.tabs.main button', 'Nastavení')
for (const tab of ['Flotila', 'Počasí', 'Složky', 'Pokrytí', 'Mapa']) {
  await clickText('.tabs.sub button', tab)
  await sleep(400)
  await shot('04-tab-' + tab.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
}
// optimisation
await clickText('.tabs.sub button', 'Pokrytí')
await clickText('.btn.primary', 'Najít')
await page.waitForFunction(() => [...document.querySelectorAll('.btn.primary')].some((b) => b.textContent.trim().startsWith('Použít')), { timeout: 120000 }).catch(() => problems.push('[check] optimalizace nedoběhla'))
report.optimise = await text('.picks')
await shot('05-optimise')
await clickText('.btn.primary', 'Použít')
await page.waitForFunction(() => !document.querySelector('.dashboard.busy'), { timeout: 60000 })
await sleep(600)
report.afterApply = await page.evaluate(() => document.querySelector('.stat-value')?.textContent)
await shot('06-applied')

// weather preset → winter
await clickText('.tabs.sub button', 'Počasí')
await page.select('.section-body select', 'winter')
await page.waitForFunction(() => !document.querySelector('.dashboard.busy'), { timeout: 60000 })
await sleep(800)
report.winter = await text('.headline')
await shot('07-winter')

for (const [label, name] of [['Porovnat letouny', 'drones'], ['Zdroje', 'sources'], ['Uložit', 'compare']]) {
  if (name === 'drones') {
    await clickText('.tabs.sub button', 'Flotila')
    await clickText('.section .btn', label)
  } else await clickText('.top-actions .btn', label)
  await sleep(500)
  await shot('08-modal-' + name)
  if (name === 'compare') {
    await clickText('.modal .btn.primary', 'Uložit aktuální')
    await sleep(400)
    await shot('08-modal-compare-saved')
  }
  await page.keyboard.press('Escape')
  await sleep(200)
}
// narrow viewport
await page.setViewport({ width: 420, height: 820, deviceScaleFactor: 1 })
await sleep(800)
await shot('09-mobile')

report.problems = problems
console.log(JSON.stringify(report, null, 2))
await browser.close()
