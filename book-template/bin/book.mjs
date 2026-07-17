#!/usr/bin/env node
// 책 빌드 CLI. 책 디렉터리(book.config.mjs가 있는 곳)에서 실행한다.
//
//   book dev      원고 감시 + VitePress 개발 서버
//   book build    원고 변환 + VitePress 빌드 (깨진 링크 검증 포함)
//   book preview  빌드 결과 미리보기
//   book pdf      빌드 결과를 한 권의 PDF로 인쇄
//   book og       홈 표지에서 OG 이미지 생성
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const cmd = process.argv[2]

async function loadBook() {
  const path = join(root, 'book.config.mjs')
  if (!existsSync(path)) {
    console.error(`book.config.mjs가 없다: ${root}`)
    process.exit(1)
  }
  // 캐시를 우회해 감시 중 재로드가 가능하게 한다
  return (await import(`${pathToFileURL(path)}?t=${Date.now()}`)).default
}

// vitepress CLI를 이 패키지의 의존성에서 찾아 하위 프로세스로 실행한다.
// (소비자 쪽에는 vitepress가 설치되어 있지 않아도 된다)
function vitepress(args) {
  const require = createRequire(import.meta.url)
  const bin = join(dirname(require.resolve('vitepress/package.json')), 'bin/vitepress.js')
  return spawn(process.execPath, [bin, ...args], { stdio: 'inherit' })
}

function vitepressAndExit(args) {
  vitepress(args).on('exit', (code) => process.exit(code ?? 1))
}

const { generateAll, generateChapter, chapterSources } = await import('../lib/generate.mjs')

switch (cmd) {
  case 'dev': {
    let book = await loadBook()
    await generateAll(root, book, { clean: true })

    // 원고와 book.config.mjs를 감시한다. .generated의 갱신은 VitePress HMR이 집는다.
    const { default: chokidar } = await import('chokidar')
    const watchTargets = () => [
      join(root, 'book.config.mjs'),
      ...chapterSources(root, book).map((c) => c.src),
    ]
    const watcher = chokidar.watch(watchTargets(), { ignoreInitial: true })
    watcher.on('change', async (path) => {
      try {
        if (path.endsWith('book.config.mjs')) {
          book = await loadBook()
          await generateAll(root, book)
          watcher.add(watchTargets())
          console.log('book.config.mjs 변경: 전체 재생성')
        } else {
          const chapter = chapterSources(root, book).find((c) => c.src === path)
          if (chapter) {
            await generateChapter(root, chapter)
            console.log(`재생성: ${chapter.route}`)
          }
        }
      } catch (e) {
        console.error(String(e?.message ?? e))
      }
    })

    vitepressAndExit(['dev', root])
    break
  }

  case 'build': {
    const book = await loadBook()
    await generateAll(root, book, { clean: true })
    vitepressAndExit(['build', root])
    break
  }

  case 'preview': {
    vitepressAndExit(['preview', root])
    break
  }

  case 'pdf': {
    const book = await loadBook()
    if (!existsSync(join(root, '.vitepress/dist'))) {
      console.error('빌드 결과가 없다. 먼저 `book build`를 실행한다.')
      process.exit(1)
    }
    const { exportPdf } = await import('../lib/pdf.mjs')
    await exportPdf(root, book)
    break
  }

  case 'og': {
    const book = await loadBook()
    if (!existsSync(join(root, '.vitepress/dist'))) {
      console.error('빌드 결과가 없다. 먼저 `book build`를 실행한다.')
      process.exit(1)
    }
    const { exportOg } = await import('../lib/og.mjs')
    await exportOg(root, book)
    break
  }

  default:
    console.error('사용법: book <dev|build|preview|pdf|og>')
    process.exit(1)
}
