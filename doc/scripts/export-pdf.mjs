// 빌드된 사이트(.vitepress/dist)를 로컬로 서빙하고, 장 순서대로 인쇄해
// 한 권의 PDF(echo-flip-book.pdf)로 합친다. 시스템 Chrome을 사용한다.
// 사용: vitepress build 후 `npm run pdf`
import { createServer } from 'node:http'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const docRoot = fileURLToPath(new URL('..', import.meta.url))
const dist = join(docRoot, '.vitepress/dist')
const BASE = '/echo-flip/'

// 책 읽기 순서
const routes = [
  'intro',
  'part1/tech-choices',
  'part1/go',
  'part1/gin',
  'part1/typescript',
  'part1/react',
  'part1/database',
  'part2/claude-code',
  'part2/agents-hooks',
  'part2/vercel',
  'part2/supabase',
]

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

// dist를 base 경로 아래에 서빙하는 최소 정적 서버 (cleanUrls 대응)
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  if (!path.startsWith(BASE)) {
    res.writeHead(404)
    return res.end()
  }
  let file = join(dist, path.slice(BASE.length) || 'index.html')
  if (!existsSync(file) || (await stat(file)).isDirectory()) {
    if (existsSync(file + '.html')) file += '.html'
    else if (existsSync(join(file, 'index.html'))) file = join(file, 'index.html')
    else {
      res.writeHead(404)
      return res.end()
    }
  }
  res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' })
  res.end(await readFile(file))
})
await new Promise((resolve) => server.listen(0, resolve))
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

const browser = await puppeteer.launch({
  executablePath: chrome,
  args: ['--no-sandbox', '--font-render-hinting=none'],
})

const chapterPdfs = []
try {
  const page = await browser.newPage()
  for (const route of routes) {
    const url = `http://127.0.0.1:${port}${BASE}${route}`
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90_000 })
    await page.evaluateHandle('document.fonts.ready')
    chapterPdfs.push(
      await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' },
      }),
    )
    console.log(`printed: ${route}`)
  }
} finally {
  await browser.close()
  server.close()
}

// 장별 PDF를 한 권으로 병합하고 연속 페이지 번호를 매긴다
const book = await PDFDocument.create()
book.setTitle('월 0원으로 운영하는 나의 웹 앱')
book.setAuthor('benelog')
book.setLanguage('ko-KR')
for (const buf of chapterPdfs) {
  const doc = await PDFDocument.load(buf)
  for (const p of await book.copyPages(doc, doc.getPageIndices())) book.addPage(p)
}
const font = await book.embedFont(StandardFonts.Helvetica)
const total = book.getPageCount()
book.getPages().forEach((p, i) => {
  const label = `${i + 1} / ${total}`
  const width = font.widthOfTextAtSize(label, 9)
  p.drawText(label, {
    x: (p.getSize().width - width) / 2,
    y: 24,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  })
})

const out = join(dist, 'echo-flip-book.pdf')
await writeFile(out, await book.save())
console.log(`PDF 생성 완료: ${out} (${total}쪽)`)
