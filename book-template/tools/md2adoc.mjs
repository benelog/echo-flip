// 일회성 마이그레이션 도구: VitePress 마크다운 원고를 AsciiDoc으로 변환한다.
// 이 원고가 실제로 쓰는 문법만 다룬다(헤딩 h1~h3, 코드 펜스, ::: info 컨테이너,
// fc-shots 갤러리, 표, 굵게, 목록, 오토링크). 변환 후 scripts/verify-roundtrip.mjs로
// downdoc 왕복 결과가 원본과 일치하는지 검증한다.
//
// 사용: node <경로>/tools/md2adoc.mjs <파일.md…>  (같은 자리에 .adoc을 만든다)
import { readFileSync, writeFileSync } from 'node:fs'

// VitePress 컨테이너 → AsciiDoc admonition (book-template/lib/adoc.mjs의 역방향)
const CONTAINER_MAP = { info: 'NOTE', tip: 'TIP', warning: 'WARNING', danger: 'CAUTION' }

// 코드 스팬(이중 백틱 포함)을 피해서 안쪽/바깥쪽을 나눈다
const CODE_SPAN = /(``[^`]+(?:`[^`]+)*``|`[^`]*`)/

function transformInline(line) {
  // 코드 스팬을 자리표시로 가려 두고 프로즈만 변환한다
  // (굵게가 코드 스팬을 감싸는 경우 **`code`** 도 다루기 위함)
  const spans = []
  const masked = line.replace(new RegExp(CODE_SPAN.source, 'g'), (m) => {
    spans.push(m)
    return `\x03${spans.length - 1}\x04`
  })
  const prose = masked
    .replace(/\*\*([^*]+)\*\*/g, '*$1*') // 굵게
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1[$1]') // 오토링크 → URL 매크로
  return prose.replace(/\x03(\d+)\x04/g, (_, i) => spans[Number(i)])
}

function convertTable(rows) {
  const cells = (row) => {
    const t = row.trim().replace(/^\|/, '').replace(/\|$/, '')
    return t.split('|').map((c) => transformInline(c.trim()))
  }
  const out = ['|===']
  let headerDone = false
  for (const row of rows) {
    if (/^\|[\s:-]*-[\s:|-]*$/.test(row.trim())) {
      // 구분 행 → 헤더 뒤 빈 줄
      out.push('')
      headerDone = true
      continue
    }
    out.push('| ' + cells(row).join(' | '))
  }
  if (!headerDone) throw new Error('헤더 구분 행이 없는 표')
  out.push('|===')
  return out
}

export function md2adoc(source, file = '(unknown)') {
  const lines = source.split('\n')
  const out = []
  let inFence = false
  let inShots = false
  let tableRows = null

  const flushTable = () => {
    if (tableRows) {
      out.push(...convertTable(tableRows))
      tableRows = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (inFence) {
      if (/^```\s*$/.test(line)) {
        out.push('----')
        inFence = false
      } else {
        out.push(line)
      }
      continue
    }
    if (inShots) {
      out.push(line)
      if (/^<p class="fc-caption">.*<\/p>\s*$/.test(line)) {
        out.push('++++')
        inShots = false
      }
      continue
    }

    const fence = line.match(/^```(\S*)\s*$/)
    if (fence) {
      flushTable()
      out.push(fence[1] ? `[source,${fence[1]}]` : '')
      if (!fence[1]) out.pop()
      out.push('----')
      inFence = true
      continue
    }

    if (line.startsWith('|')) {
      ;(tableRows ??= []).push(line)
      continue
    }
    flushTable()

    if (/^<div class="fc-shots/.test(line)) {
      out.push('++++', line)
      inShots = true
      continue
    }

    const container = line.match(/^::: (info|tip|warning|danger)\s*(.*)$/)
    if (container) {
      if (container[2]) out.push('.' + container[2])
      out.push(`[${CONTAINER_MAP[container[1]]}]`, '====')
      continue
    }
    if (/^:::\s*$/.test(line)) {
      out.push('====')
      continue
    }

    const heading = line.match(/^(#{1,4}) (.*)$/)
    if (heading) {
      out.push('='.repeat(heading[1].length) + ' ' + transformInline(heading[2]))
      continue
    }

    const ul = line.match(/^- (.*)$/)
    if (ul) {
      out.push('* ' + transformInline(ul[1]))
      continue
    }
    const ol = line.match(/^\d+\. (.*)$/)
    if (ol) {
      out.push('. ' + transformInline(ol[1]))
      continue
    }

    out.push(transformInline(line))
  }
  flushTable()
  if (inFence) throw new Error(`${file}: 닫히지 않은 코드 펜스`)
  if (inShots) throw new Error(`${file}: 닫히지 않은 fc-shots 영역`)
  return out.join('\n')
}

const files = process.argv.slice(2)
if (!files.length) {
  console.error('사용법: node tools/md2adoc.mjs <파일.md…>')
  process.exit(1)
}
for (const f of files) {
  if (!f.endsWith('.md')) throw new Error(`md 파일이 아니다: ${f}`)
  const adoc = md2adoc(readFileSync(f, 'utf8'), f)
  const outPath = f.replace(/\.md$/, '.adoc')
  writeFileSync(outPath, adoc)
  console.log(`변환: ${f} → ${outPath}`)
}
