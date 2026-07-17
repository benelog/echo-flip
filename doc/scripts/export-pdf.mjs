// 빌드된 사이트(.vitepress/dist)를 로컬로 서빙하고, 표지·차례와 함께
// 장 순서대로 인쇄해 한 권의 PDF(flashcard-book.pdf)로 합친다.
// 북마크(PDF 아웃라인)와 연속 쪽 번호를 넣는다. 시스템 Chrome을 사용한다.
// 사용: vitepress build 후 `npm run pdf`
import { createServer } from 'node:http'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { PDFDocument, PDFHexString, PDFName, PDFNumber, StandardFonts, rgb } from 'pdf-lib'

const docRoot = fileURLToPath(new URL('..', import.meta.url))
const dist = join(docRoot, '.vitepress/dist')
const BASE = '/flashcard/'

const TITLE = '이해하며 만드는 나만의 웹 앱'
const SUBTITLE = 'AI에게 지시해 쉬운 프로그래밍 언어로 만들고, 개념을 익혀 오래 운영한다'
const AUTHOR = '정상혁'
const SITE = 'benelog.github.io/flashcard'

// 책 읽기 순서. part가 있는 항목 앞에는 차례에 부 제목을 넣는다.
const chapters = [
  { route: 'preface', title: '저자 서문', part: '서문' },
  { route: 'intro', title: '도입: 무엇을 만드는가', part: '도입' },
  { route: 'part1/tech-choices', title: '1장 기술 선택: 요구사항에서 아키텍처까지', part: '1부 내 컴퓨터에서 웹 앱 완성하기' },
  { route: 'part1/claude-code', title: '2장 Claude Code: AI 에이전트와 개발하기' },
  { route: 'part1/instructing', title: '3장 에이전트에게 지시하기: Plan 모드 활용' },
  { route: 'part1/database-basics', title: '4장 데이터베이스 기초: 테이블, SQL, 인덱스' },
  { route: 'part1/database', title: '5장 데이터베이스 설계: 요구사항에서 테이블로' },
  { route: 'part1/go-basics', title: '6장 Go 기초: 모듈, 변수, 함수' },
  { route: 'part1/go', title: '7장 Go 코드 읽기: 구조체, 포인터, 에러 처리' },
  { route: 'part1/go-testing', title: '8장 Go 테스트와 품질 게이트: 도구, 훅, 서브에이전트' },
  { route: 'part1/gin', title: '9장 Gin으로 만드는 HTTP API' },
  { route: 'part1/html-css', title: '10장 HTML과 CSS: 화면을 이루는 문서와 스타일' },
  { route: 'part1/go-templates', title: '11장 html/template으로 만드는 화면' },
  { route: 'part1/htmx', title: '12장 htmx: 자바스크립트 없이 만드는 동적 화면' },
  { route: 'part1/local-dev', title: '13장 로컬 개발 환경: 내 컴퓨터에서 앱 완성하기' },
  { route: 'part2/git', title: '14장 Git: 개념과 브랜치 정책', part: '2부 세상에 공개하고 오래 운영하기' },
  { route: 'part2/github-actions', title: '15장 GitHub Actions: 원격 품질 게이트' },
  { route: 'part2/vercel', title: '16장 Vercel: 한 플랫폼에 모두 배포하기' },
  { route: 'part2/supabase-auth', title: '17장 Supabase 인증: OAuth와 JWKS 검증' },
  { route: 'part2/supabase-db', title: '18장 Supabase 데이터베이스: pgx 연결과 개발·운영 DB 분리' },
  { route: 'part2/pwa', title: '19장 PWA: 설치되는 앱으로 만들기' },
  { route: 'part2/free-tier', title: '20장 무료 티어 운영과 한도 관리' },
  { route: 'part2/whats-next', title: '21장 다음 단계: 여기서 더 공부할 것들' },
  { route: 'appendix/setup', title: '부록 A 개발 도구 설치', part: '부록' },
  { route: 'appendix/deploy', title: '부록 B 배포 준비: Supabase·Google·GitHub·Vercel 설정' },
]

const FONT_LINKS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap">`

function coverHtml() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONT_LINKS}
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .cover {
      position: relative; box-sizing: border-box; width: 210mm; height: 296mm;
      padding: 20mm 19mm 17mm 24mm; overflow: hidden;
      background: #f7f5ef; color: #151a22; font-family: 'Noto Sans KR', sans-serif;
      display: flex; flex-direction: column;
    }
    .spine { position: absolute; inset: 0 auto 0 0; width: 4mm; background: #16a6a1; }
    .kicker { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9mm; padding-bottom: 4mm; border-bottom: 0.8mm solid #151a22; font-size: 9pt; font-weight: 700; color: #38404c; }
    .kicker b { display: grid; place-items: center; width: 10mm; height: 10mm; background: #151a22; color: #fff; font-size: 9pt; }
    h1 { font-size: 36pt; line-height: 1.2; font-weight: 700; margin: 0; word-break: keep-all; }
    h1 .hl { display: inline-block; padding: 0 3mm 1.5mm; background: #f2cf35; font-size: 41pt; line-height: 1; }
    .subtitle { margin: 7mm 0 0; font-family: 'Noto Serif KR', serif; font-size: 14pt; font-weight: 600; color: #454d58; line-height: 1.75; word-break: keep-all; }
    .diagram { flex: none; width: 128mm; margin: 12mm 0 0; }
    .layer { display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; height: 15mm; padding: 0 7mm; border: 0.7mm solid #151a22; background: #fff; box-shadow: 2.5mm 2.5mm 0 #d8e9e7; }
    .layer .name { font-size: 12pt; font-weight: 700; }
    .layer .tech { font-size: 10pt; font-weight: 700; letter-spacing: 0.3mm; color: #0e7d78; }
    .link { width: 0.7mm; height: 5mm; margin: 0 auto; background: #151a22; }
    .pitch { margin: 9mm 0 0; padding: 0; list-style: none; font-size: 10.5pt; line-height: 1.9; font-weight: 600; color: #48505b; word-break: keep-all; }
    .pitch li::before { content: ''; display: inline-block; width: 2mm; height: 2mm; margin: 0 3mm 0.4mm 0; background: #16a6a1; }
    .bottom { display: flex; align-items: flex-end; justify-content: flex-end; margin-top: auto; padding-top: 5mm; border-top: 0.3mm solid #aeb3b7; }
    .author { font-size: 14pt; font-weight: 600; margin: 0 0 2mm; text-align: right; }
    .site { font-size: 8.5pt; color: #777e86; margin: 0; text-align: right; }
  </style></head><body>
  <div class="cover">
    <div class="spine"></div>
    <div class="kicker"><span>AI와 함께 만드는 실전 개발서</span><b>01</b></div>
    <h1><span class="hl">이해</span>하며<br>만드는<br>나만의 웹 앱</h1>
    <p class="subtitle">${SUBTITLE}</p>
    <div class="diagram">
      <div class="layer"><span class="name">화면</span><span class="tech">HTML · CSS</span></div>
      <div class="link"></div>
      <div class="layer"><span class="name">서버</span><span class="tech">Go</span></div>
      <div class="link"></div>
      <div class="layer"><span class="name">데이터</span><span class="tech">SQL</span></div>
    </div>
    <ul class="pitch">
      <li>코드는 AI 에이전트가 쓰고, 판단은 사람이 한다</li>
      <li>이해할 언어는 최소화(HTML/CSS, Go, SQL)</li>
      <li>무료 티어에 유리하게 수십 MB 메모리만 사용하는 서버</li>
    </ul>
    <div class="bottom">
      <div><p class="author">${AUTHOR} 지음</p><p class="site">${SITE}</p></div>
    </div>
  </div></body></html>`
}

function tocHtml(startPages) {
  const rows = chapters
    .map((c, i) => {
      const part = c.part
        ? `<div class="part">${c.part}</div>`
        : ''
      return `${part}<div class="row"><span class="t">${c.title}</span><span class="dots"></span><span class="p">${startPages[i]}</span></div>`
    })
    .join('\n')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONT_LINKS}
  <style>
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Noto Serif KR', serif; color: #1c1c1e; }
    h1 { font-family: 'Noto Sans KR', sans-serif; font-size: 21pt; font-weight: 700; margin: 6mm 0 12mm; }
    .part { font-family: 'Noto Sans KR', sans-serif; font-size: 11.5pt; font-weight: 700; color: #33436e; margin: 9mm 0 2.5mm; }
    .row { display: flex; align-items: baseline; font-size: 11pt; line-height: 2.2; word-break: keep-all; }
    .row .t { padding-right: 3mm; }
    .row .dots { flex: 1; border-bottom: 1px dotted #b3b3b8; transform: translateY(-1.5mm); }
    .row .p { padding-left: 3mm; font-variant-numeric: tabular-nums; color: #444; }
  </style></head><body>
  <h1>차례</h1>
  ${rows}
  </body></html>`
}

// ── dist 정적 서버 (cleanUrls 대응) ─────────────────────────────
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

// ── Chrome으로 인쇄 ─────────────────────────────────────────────
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

const CONTENT_MARGIN = { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' }
const browser = await puppeteer.launch({
  executablePath: chrome,
  args: ['--no-sandbox', '--font-render-hinting=none'],
})

let coverBuf, tocBuf
const chapterDocs = []
try {
  const page = await browser.newPage()

  // 본문 장들
  for (const { route } of chapters) {
    await page.goto(`http://127.0.0.1:${port}${BASE}${route}`, {
      waitUntil: 'networkidle0',
      timeout: 90_000,
    })
    await page.evaluateHandle('document.fonts.ready')
    const buf = await page.pdf({ format: 'A4', printBackground: true, margin: CONTENT_MARGIN })
    chapterDocs.push(await PDFDocument.load(buf))
    console.log(`printed: ${route}`)
  }

  // 장별 시작 쪽 번호(본문 기준 1부터)를 계산해 차례를 만든다
  const startPages = []
  let cursor = 1
  for (const doc of chapterDocs) {
    startPages.push(cursor)
    cursor += doc.getPageCount()
  }

  await page.setContent(tocHtml(startPages), { waitUntil: 'load', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  tocBuf = await page.pdf({ format: 'A4', printBackground: true, margin: CONTENT_MARGIN })

  await page.setContent(coverHtml(), { waitUntil: 'load', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  coverBuf = await page.pdf({ format: 'A4', printBackground: true, margin: 0, pageRanges: '1' })
} finally {
  await browser.close()
  server.close()
}

// ── 병합: 표지 + 차례 + 본문 ────────────────────────────────────
const book = await PDFDocument.create()
book.setTitle(TITLE)
book.setAuthor(AUTHOR)
book.setSubject(SUBTITLE)
book.setLanguage('ko-KR')

async function append(src) {
  const pages = await book.copyPages(src, src.getPageIndices())
  pages.forEach((p) => book.addPage(p))
  return pages.length
}

const coverPages = await append(await PDFDocument.load(coverBuf))
const tocPages = await append(await PDFDocument.load(tocBuf))
const frontPages = coverPages + tocPages

const chapterStartIndex = [] // 병합본에서 각 장의 0-기준 페이지 인덱스
for (const doc of chapterDocs) {
  chapterStartIndex.push(book.getPageCount())
  await append(doc)
}

// 본문에만 연속 쪽 번호를 찍는다 (표지·차례 제외)
const font = await book.embedFont(StandardFonts.Helvetica)
const contentTotal = book.getPageCount() - frontPages
book.getPages().forEach((p, i) => {
  if (i < frontPages) return
  const label = `${i - frontPages + 1} / ${contentTotal}`
  const width = font.widthOfTextAtSize(label, 9)
  p.drawText(label, {
    x: (p.getSize().width - width) / 2,
    y: 24,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  })
})

// ── 북마크(PDF 아웃라인) ────────────────────────────────────────
const outlineItems = [
  { title: '차례', pageIndex: coverPages },
  ...chapters.map((c, i) => ({ title: c.title, pageIndex: chapterStartIndex[i] })),
]
{
  const ctx = book.context
  const rootRef = ctx.nextRef()
  const itemRefs = outlineItems.map(() => ctx.nextRef())
  outlineItems.forEach((item, i) => {
    const dict = ctx.obj({})
    dict.set(PDFName.of('Title'), PDFHexString.fromText(item.title))
    dict.set(PDFName.of('Parent'), rootRef)
    dict.set(PDFName.of('Dest'), ctx.obj([book.getPage(item.pageIndex).ref, PDFName.of('Fit')]))
    if (i > 0) dict.set(PDFName.of('Prev'), itemRefs[i - 1])
    if (i < itemRefs.length - 1) dict.set(PDFName.of('Next'), itemRefs[i + 1])
    ctx.assign(itemRefs[i], dict)
  })
  const root = ctx.obj({})
  root.set(PDFName.of('Type'), PDFName.of('Outlines'))
  root.set(PDFName.of('First'), itemRefs[0])
  root.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1])
  root.set(PDFName.of('Count'), PDFNumber.of(outlineItems.length))
  ctx.assign(rootRef, root)
  book.catalog.set(PDFName.of('Outlines'), rootRef)
}

const out = join(dist, 'flashcard-book.pdf')
await writeFile(out, await book.save())
console.log(`PDF 생성 완료: ${out} (표지 ${coverPages} + 차례 ${tocPages} + 본문 ${contentTotal}쪽)`)
