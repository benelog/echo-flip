// 표지의 단일 소스. book.config의 cover 데이터에서
// 홈(랜딩) 페이지 마크다운과 PDF 표지·차례 HTML을 만든다.
// 스타일은 theme/custom.css(홈)와 이 파일 안의 인쇄 CSS(PDF)가 담당한다.
import { FONT_LINKS } from './fonts.mjs'
import { firstRoute } from './toc.mjs'

// cover.actions의 link 약어를 실제 주소로 푼다.
function actionHref(book, link) {
  if (link === 'start') return book.base + firstRoute(book)
  if (link === 'pdf') return `${book.site}${book.pdf.fileName}`
  if (link === 'repo') return book.repo
  return link
}

// 홈(index.md) — 책 표지 랜딩 페이지
export function homeCoverMarkdown(book) {
  const c = book.cover
  const start = book.base + firstRoute(book)
  const diagram = c.diagram?.length
    ? `\n    <div class="fc-book-diagram" aria-hidden="true">\n      ${c.diagram
        .map(
          (l) =>
            `<div class="fc-layer"><span class="fc-layer-name">${l.name}</span><span class="fc-layer-tech">${l.tech}</span></div>`,
        )
        .join('\n      <i class="fc-layer-link"></i>\n      ')}\n    </div>`
    : ''
  const pitch = c.pitch?.length
    ? `\n    <ul class="fc-book-pitch">\n${c.pitch.map((p) => `      <li>${p}</li>`).join('\n')}\n    </ul>`
    : ''
  const actions = (c.actions ?? [])
    .map(
      (a) =>
        `    <a class="fc-btn${a.brand ? ' brand' : ''}" href="${actionHref(book, a.link)}">${a.text}</a>`,
    )
    .join('\n')
  return `---
layout: page
sidebar: false
---

<div class="fc-home">
  <a class="fc-book" href="${start}" aria-label="읽기 시작">
    <div class="fc-book-kicker"><span>${c.kicker}</span><b>${c.volume}</b></div>
    <h1>${c.titleHtml}</h1>
    <p class="fc-book-subtitle">${c.subtitleHtml}</p>${diagram}${pitch}
    <div class="fc-book-footer"><p class="fc-book-author">${book.author} 지음</p></div>
  </a>
  <p class="fc-home-desc">${c.homeDesc}</p>
  <div class="fc-home-actions">
${actions}
  </div>
</div>
`
}

// PDF 표지 (A4 한 장, 인쇄용 CSS 내장)
export function pdfCoverHtml(book) {
  const c = book.cover
  const diagram = c.diagram?.length
    ? `\n    <div class="diagram">\n      ${c.diagram
        .map(
          (l) =>
            `<div class="layer"><span class="name">${l.name}</span><span class="tech">${l.tech}</span></div>`,
        )
        .join('\n      <div class="link"></div>\n      ')}\n    </div>`
    : ''
  const pitch = c.pitch?.length
    ? `\n    <ul class="pitch">\n${c.pitch.map((p) => `      <li>${p}</li>`).join('\n')}\n    </ul>`
    : ''
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
    h1 strong { display: inline-block; padding: 0 3mm 1.5mm; background: #f2cf35; font-size: 41pt; line-height: 1; font-weight: 700; }
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
    <div class="kicker"><span>${c.kicker}</span><b>${c.volume}</b></div>
    <h1>${c.titleHtml}</h1>
    <p class="subtitle">${book.subtitle}</p>${diagram}${pitch}
    <div class="bottom">
      <div><p class="author">${book.author} 지음</p><p class="site">${book.siteLabel}</p></div>
    </div>
  </div></body></html>`
}

// PDF 차례 (장별 시작 쪽 번호 포함)
export function pdfTocHtml(chapters, startPages) {
  const rows = chapters
    .map((c, i) => {
      const part = c.part ? `<div class="part">${c.part}</div>` : ''
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
