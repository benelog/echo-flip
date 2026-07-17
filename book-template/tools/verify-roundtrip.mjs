// 일회성 마이그레이션 검증: 원본 md와 (adoc → downdoc) 왕복 md를 정규화해 비교한다.
// 렌더링에 영향 없는 차이(빈 줄 수, 목록 마커, 표 패딩, 오토링크 표기)는 정규화로 걷어 내고,
// 그 밖의 모든 차이를 diff로 보여 준다.
//
// 사용: 책 디렉터리(book.config.mjs가 있는 곳)에서
//   node <경로>/tools/verify-roundtrip.mjs [route…]   (생략 시 toc 전체)
//   원본:   <route>.md (작업 트리)
//   왕복본: .generated/<route>.md (book build/dev가 .adoc에서 생성)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { flattenChapters } from '../lib/toc.mjs'

const book = (await import(pathToFileURL(join(process.cwd(), 'book.config.mjs')))).default

function normalize(md) {
  const lines = md.split('\n').map((l) => l.replace(/\s+$/, ''))
  const out = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    // 표: 셀 단위 트리밍, 구분 행 통일
    if (line.startsWith('|')) {
      if (/^\|[\s:-]*-[\s:|-]*$/.test(line)) {
        out.push('|sep|')
        continue
      }
      const cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim())
      out.push('|' + cells.join('|') + '|')
      continue
    }
    // 목록 마커 통일
    line = line.replace(/^([*-]) /, '- ')
    // 오토링크를 링크 표기로 통일
    line = line.replace(/<(https?:\/\/[^>\s]+)>/g, '[$1]($1)')
    // 백틱 없는 이중 백틱 스팬은 단일 백틱과 렌더링이 같다
    line = line.replace(/``([^`]+)``/g, '`$1`')
    // 프로즈의 HTML 엔티티는 원문 문자와 렌더링이 같다 (코드 스팬 안은 그대로)
    line = line
      .split(/(`[^`]*`)/)
      .map((seg, i) =>
        i % 2 === 1
          ? seg
          : seg.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
      )
      .join('')
    out.push(line)
  }
  // 컨테이너 여닫이 안쪽의 장식용 빈 줄 제거
  const trimmed = []
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '' && i > 0 && /^::: \S/.test(trimmed[trimmed.length - 1] ?? '')) continue
    if (out[i] === '' && out[i + 1] === ':::') continue
    trimmed.push(out[i])
  }
  // 연속 빈 줄 접기 + 문서 앞뒤 빈 줄 제거
  const collapsed = trimmed
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '\n')
  return collapsed
}

const routes = process.argv.slice(2)
const chapters = flattenChapters(book).filter((c) => !routes.length || routes.includes(c.route))
const tmp = mkdtempSync(join(tmpdir(), 'roundtrip-'))
let fail = 0

for (const { route } of chapters) {
  const orig = `${route}.md`
  const gen = `.generated/${route}.md`
  if (!existsSync(orig)) {
    console.log(`skip  ${route} (원본 md 없음)`)
    continue
  }
  if (!existsSync(gen)) {
    console.log(`skip  ${route} (.generated 없음 — book build 먼저)`)
    continue
  }
  const a = normalize(readFileSync(orig, 'utf8'))
  const b = normalize(readFileSync(gen, 'utf8'))
  if (a === b) {
    console.log(`PASS  ${route}`)
    continue
  }
  fail++
  const fa = join(tmp, route.replace(/\//g, '_') + '.orig')
  const fb = join(tmp, route.replace(/\//g, '_') + '.roundtrip')
  writeFileSync(fa, a)
  writeFileSync(fb, b)
  console.log(`FAIL  ${route}`)
  try {
    execFileSync('diff', ['-u', fa, fb], { stdio: 'inherit' })
  } catch {}
}
console.log(fail ? `\n${fail}개 장 불일치 (diff는 ${tmp})` : '\n전체 일치')
process.exit(fail ? 1 : 0)
