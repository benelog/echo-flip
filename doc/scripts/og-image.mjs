// SNS 공유 미리보기용 Open Graph 이미지(1200×630)를 만든다.
// 빌드된 홈의 책 표지에서 시리즈 라벨·제목·부제 영역을 잘라 public/og-image.png로 저장한다.
//
// 사용법: npm run build && node scripts/og-image.mjs
// 저장 후 다시 빌드해야 dist에 포함된다. 표지 디자인이나 제목이 바뀌면 재생성한다.
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const DIST = fileURLToPath(new URL('../.vitepress/dist', import.meta.url))
const OUT = fileURLToPath(new URL('../public/og-image.png', import.meta.url))
const BASE = '/flashcard/'
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
}

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.startsWith(BASE)) p = p.slice(BASE.length)
  if (p === '' || p.endsWith('/')) p += 'index.html'
  let file = join(DIST, p)
  if (!existsSync(file) && existsSync(file + '.html')) file += '.html'
  if (!existsSync(file)) { res.statusCode = 404; return res.end('not found') }
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream')
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const chrome =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/opt/google/chrome/chrome',
  ].find(existsSync)
if (!chrome) throw new Error('Chrome 실행 파일을 찾지 못했다 (PUPPETEER_EXECUTABLE_PATH로 지정 가능)')

const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 1 })
await page.goto(`http://127.0.0.1:${port}${BASE}`, { waitUntil: 'networkidle0' })
await page.evaluateHandle('document.fonts.ready')

// 표지 카드 위쪽(라벨·제목·부제)을 1200:630 비율로 자를 영역을 계산한다.
const clip = await page.evaluate(() => {
  document.querySelector('.VPNav')?.remove()
  const card = document.querySelector('.fc-book').getBoundingClientRect()
  const sub = document.querySelector('.fc-book-subtitle').getBoundingClientRect()
  const pad = 18
  const height = sub.bottom + pad - (card.top - pad)
  const width = (height * 1200) / 630
  return {
    x: card.left - (width - card.width) / 2,
    y: card.top - pad,
    width,
    height,
  }
})

// deviceScaleFactor로 확대해 잘라낸 결과가 정확히 1200×630 픽셀이 되게 한다.
await page.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 1200 / clip.width })
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: OUT, clip })

await browser.close()
server.close()
console.log(`OG 이미지 생성 완료: ${OUT} (${Math.round(clip.width)}×${Math.round(clip.height)} CSS px → 1200×630)`)
