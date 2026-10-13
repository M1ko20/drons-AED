// Second scripted session: concurrent emergencies, offline background, zones, sample scenarios, exports.
import puppeteer from 'puppeteer-core'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5183/'
const out = process.argv[3] ?? 'screenshots'
const dl = path.join(out, 'downloads')
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')].filter(Boolean).find((p) => existsSync(p))
await mkdir(dl, { recursive: true })
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 950 })
const cdp = await page.createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(dl) })
const problems = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') })
const click = async (selector, text) => {
  const ok = await page.evaluate((selector, text) => {
    const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.trim().includes(text))
    el?.click()
    return !!el
  }, selector, text)
  if (!ok) problems.push(`[check] missing ${selector} "${text}"`)
  await sleep(300)
}
const idle = () => page.waitForFunction(() => !document.querySelector('.dashboard.busy'), { timeout: 90000 })
const stats = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.stat')].map((s) => [s.querySelector('.stat-label').childNodes[0].textContent, s.querySelector('.stat-value').textContent + ' · ' + (s.querySelector('.stat-sub')?.textContent ?? '')])))
const report = {}

await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('once')) { localStorage.clear(); sessionStorage.setItem('once', '1') } })
await page.goto(url, { waitUntil: 'networkidle2' })
await page.waitForSelector('.dashboard')
await idle()
const box = await (await page.$('.map')).boundingBox()

// 1. two emergencies one minute apart served by a single base with one drone
await click('.preset', 'Různé typy')
await idle()
report.mixedCandidates = await page.evaluate(() => [...document.querySelectorAll('.results .table tbody tr')].slice(-5).map((r) => r.innerText.replace(/\s+/g, ' ')))
await shot('10-mixed-models')
await click('.preset', 'Malá flotila')
await idle()
await click('.btn.small', '+ Přidat další')
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.62)
await sleep(600)
await click('.btn.small', '+ Přidat další')
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.46)
await sleep(600)
// set call times of 2nd and 3rd to 1 and 2 minutes
const callInputs = await page.$$('.card .num input')
report.incidentCards = callInputs.length
for (const [i, v] of [[1, '1'], [2, '2']]) {
  if (!callInputs[i]) continue
  await callInputs[i].click({ clickCount: 3 })
  await callInputs[i].type(v)
  await page.keyboard.press('Enter')
  await sleep(300)
}
await sleep(600)
report.incidents = await page.evaluate(() => [...document.querySelectorAll('.card .card-foot')].map((c) => c.innerText.replace(/\s+/g, ' ')))
report.thirdIncidentComponents = await page.evaluate(() => [...document.querySelectorAll('.results .table.compact')][0]?.innerText.replace(/\s+/g, ' ').slice(0, 260))
await shot('11-three-emergencies')

// 2. offline background
await click('.tabs button', 'Vrstvy')
await page.evaluate(() => document.querySelectorAll('input[name=basemap]')[1].click())
await sleep(2500)
await shot('12-offline-basemap')
await page.evaluate(() => document.querySelectorAll('input[name=basemap]')[0].click())
await sleep(2500)

// 3. enforce the airport zone and place an emergency behind it
await click('.tabs button', 'Scénář')
await click('.preset', 'Rozšířená flotila')
await idle()
report.expanded = await stats()
await click('.tabs button', 'Podmínky')
await page.evaluate(() => { const row = [...document.querySelectorAll('.zone-row')].find((r) => r.textContent.includes('LKFR')); row.querySelector('input[type=checkbox]').click() })
await idle()
await sleep(500)
await shot('13-zone-enforced')
report.zoneRoute = await page.evaluate(() => document.querySelector('.headline .status')?.textContent)

// 4. bad weather preset and baseline
await click('.tabs button', 'Scénář')
await click('.preset', 'Výchozí stav')
await idle()
report.baseline = { headline: await page.evaluate(() => document.querySelector('.headline')?.innerText.replace(/\s+/g, ' ')), stats: await stats() }
await shot('14-baseline')
await click('.preset', 'Mrazuvzdorné multikoptéry')
await idle()
report.multirotor = await stats()
await shot('15-multirotor')

// 4b. fleet costs: screenshot, then override the Matrice 400 price and check the total changes
await click('.tabs button', 'Flotila')
await sleep(400)
const costTitle = () => page.evaluate(() => [...document.querySelectorAll('.section-toggle')].find((b) => b.textContent.includes('Náklady flotily'))?.textContent.trim())
report.costBefore = await costTitle()
await shot('15b-fleet-costs')
const priceInput = await page.$('.cost-table .num input')
await priceInput.click({ clickCount: 3 })
await priceInput.type('50000')
await page.keyboard.press('Enter')
await sleep(500)
report.costAfterPriceChange = await costTitle()
report.costRow = await page.evaluate(() => document.querySelector('.cost-table tbody tr')?.innerText.replace(/\s+/g, ' '))

// 5. exports
await click('.top-actions .btn', 'Export')
await click('.menu button', 'Události')
await click('.top-actions .btn', 'Export')
await click('.menu button', 'Sledovaná místa')
await click('.top-actions .btn', 'Export')
await click('.menu button', 'Celý scénář')
await sleep(1200)
report.downloads = {}
for (const f of await readdir(dl)) {
  const text = await readFile(path.join(dl, f), 'utf8')
  report.downloads[f] = `${text.length} bytes · ${text.split('\n').length} lines · ${text.split('\n')[f.endsWith('.json') ? 3 : 2].slice(0, 110)}`
  if (f.endsWith('.json')) JSON.parse(text)
}
await click('.top-actions .btn', 'Export')
await click('.menu button', 'Souhrn k tisku')
await sleep(400)
await shot('16-report')
await page.keyboard.press('Escape')
await click('.top-actions .btn', 'Zdroje')
await sleep(300)
await shot('17-sources')
await click('.modal .tabs button', 'Ceny a náklady')
await shot('18-costs')
await page.keyboard.press('Escape')

// 6. persistence across reload
await page.reload({ waitUntil: 'networkidle2' })
await page.waitForSelector('.dashboard')
report.afterReload = await page.evaluate(() => document.querySelector('.scenario-name')?.textContent)
report.problems = problems
console.log(JSON.stringify(report, null, 2))
await browser.close()
