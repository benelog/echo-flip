<script setup>
import DefaultTheme from 'vitepress/theme'
import { useData, useRoute, useRouter } from 'vitepress'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { blockAnchors, findRange, loadList, migrateLegacyKeys, saveList, serializeRange } from './ebook'

const { page, theme } = useData()
const route = useRoute()
const router = useRouter()
const isHome = computed(() => page.value.relativePath === 'index.md')

// 저장소 키 접두사 — book.config의 storage 설정에서 주입된다 (같은 도메인의 다른 책과 충돌 방지)
const ebookCfg = theme.value?.ebook ?? {}
const PREFIX = ebookCfg.storagePrefix || 'book'
const TOC_KEY = `${PREFIX}-toc-hidden`
const OPEN_LAST_KEY = `${PREFIX}-open-last`
const PENDING_KEY = `${PREFIX}-pending`

function docRoot() {
  return document.querySelector('.vp-doc')
}

// 목차(왼쪽 사이드바) 접기/펼치기 — 이북 뷰어의 몰입 모드
const tocHidden = ref(false)

function applyTocState() {
  document.documentElement.classList.toggle('fc-toc-hidden', tocHidden.value)
}

function toggleToc() {
  tocHidden.value = !tocHidden.value
  applyTocState()
  try {
    localStorage.setItem(TOC_KEY, tocHidden.value ? '1' : '')
  } catch {}
  // 본문 폭이 바뀌므로 페이지를 다시 계산한다
  nextTick(() => setTimeout(setupPaged, 50))
}

// ── 페이지 넘김 모드 ──────────────────────────────────────────
// 데스크톱에서는 장을 아래로 스크롤하지 않고, 본문을 CSS 다단으로
// 흘려 한 화면을 넘는 내용이 다음 열(페이지)로 이어지게 한다.
// 폭이 넉넉하면 두 열 = 펼친 책의 좌우 페이지가 된다.
// 페이지 넘김 = 다단 컨테이너를 화면 폭만큼 가로 스크롤.
const pagedActive = ref(false)
const curPage = ref(0) // 펼침면(spread) 인덱스
const numPages = ref(1) // 펼침면 수
const totalCols = ref(1) // 실제 페이지(열) 수
const cols = ref(1) // 한 화면에 보이는 페이지 수 (1 또는 2)
const cardRect = ref(null) // 페이지 카드의 화면 위치 (리본 배치용)
let scroller = null // .content-container — 다단 + overflow hidden
let step = 0 // 한 번 넘길 때의 폭 (화면 폭 + 열 간격)

function isPagedViewport() {
  return window.matchMedia('(min-width: 960px)').matches
}

function measure() {
  if (!scroller) return
  const style = getComputedStyle(scroller)
  const gap = parseFloat(style.columnGap) || 0
  cols.value = parseInt(style.columnCount) || 1
  const colW = (scroller.clientWidth - (cols.value - 1) * gap) / cols.value
  step = scroller.clientWidth + gap
  totalCols.value =
    colW > 0 ? Math.max(1, Math.round((scroller.scrollWidth + gap) / (colW + gap))) : 1
  numPages.value = Math.max(1, Math.ceil(totalCols.value / cols.value))
  if (curPage.value > numPages.value - 1) curPage.value = numPages.value - 1
  applyPage(false)
}

function applyPage(smooth = true) {
  flipCleanup?.()
  scroller?.scrollTo({ left: curPage.value * step, behavior: smooth ? 'smooth' : 'auto' })
}

// ── 책장 넘김 애니메이션 ──────────────────────────────────────
// 넘어가는 페이지를 복제해 책등을 축으로 3D 회전시킨다. 앞면은
// 지금 보이는 면, 뒷면은 넘긴 뒤 나타날 면이라 실제 종이를 젖히는
// 것처럼 보인다. 밑장은 목표 페이지로 즉시 스크롤해 두고, 넘기는
// 종이가 내려앉을 자리는 이전 내용 복제본(cover)으로 가려 뒀다가
// 애니메이션이 끝나면 통째로 걷어 낸다.
const FLIP_MS = 560
let flipCleanup = null

function animateFlip(from, to) {
  if (!scroller || !step || from === to) return false
  if (!('animate' in Element.prototype)) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const forward = to > from
  const W = scroller.clientWidth
  const H = scroller.clientHeight
  const S = from * step
  const T = to * step
  const two = cols.value === 2
  const w = two ? W / 2 : W // 넘기는 종이 한 장의 폭
  const px = two ? W / 2 : 0 // 회전축(책등) 위치

  flipCleanup?.()
  scroller.scrollTo({ left: T, behavior: 'auto' })

  // x0 위치에 놓여 scrollX 지점의 내용을 보여 주는 본문 복제본
  const cloneAt = (x0, scrollX) => {
    const c = scroller.cloneNode(true)
    for (const el of c.querySelectorAll('[id]')) el.removeAttribute('id')
    c.removeAttribute('id')
    c.style.cssText = `position:absolute;top:0;left:${-(scrollX + x0)}px;width:${W}px;height:${H}px;margin:0;`
    return c
  }
  const shadeEl = (background) => {
    const s = document.createElement('div')
    s.className = 'fc-flip-shade'
    s.style.background = background
    return s
  }

  const overlay = document.createElement('div')
  overlay.className = 'fc-flip'
  overlay.style.cssText =
    `left:${scroller.offsetLeft}px;top:${scroller.offsetTop}px;width:${W}px;height:${H}px;` +
    `perspective:${Math.max(1400, W * 1.6)}px;perspective-origin:${px}px 50%;`

  // 넘어가는 종이 — 책등 쪽 모서리를 축으로 회전
  const sheet = document.createElement('div')
  sheet.className = 'fc-flip-sheet'
  sheet.style.cssText = `left:${px}px;width:${w}px;`

  const front = document.createElement('div')
  front.className = 'fc-flip-face'
  front.appendChild(cloneAt(px, forward ? S : T))
  const frontShade = shadeEl(
    'linear-gradient(to right, rgba(0,0,0,0.32), rgba(0,0,0,0.05) 55%, transparent)',
  )
  front.appendChild(frontShade)

  const back = document.createElement('div')
  back.className = 'fc-flip-face back'
  // 펼침 모드에서는 종이 뒷면이 반대쪽 페이지 내용, 한 페이지 모드에서는
  // 뒷면이 화면 밖으로 넘어가므로 빈 종이로 둔다.
  if (two) back.appendChild(cloneAt(px - w, forward ? T : S))
  const backShade = shadeEl(
    'linear-gradient(to left, rgba(0,0,0,0.32), rgba(0,0,0,0.05) 55%, transparent)',
  )
  back.appendChild(backShade)
  sheet.append(front, back)

  // 종이가 내려앉을 자리 — 끝날 때까지 이전 내용을 보여 준다
  let cast = null
  if (two || !forward) {
    const cover = document.createElement('div')
    cover.className = 'fc-flip-cover'
    const cx = forward ? px - w : px
    cover.style.cssText = `left:${cx}px;width:${w}px;`
    cover.appendChild(cloneAt(cx, S))
    cast = shadeEl(
      forward
        ? 'linear-gradient(to left, rgba(0,0,0,0.28), transparent 65%)'
        : 'linear-gradient(to right, rgba(0,0,0,0.28), transparent 65%)',
    )
    cover.appendChild(cast)
    overlay.appendChild(cover)
  }
  overlay.appendChild(sheet)
  scroller.parentElement.appendChild(overlay)

  const opts = { duration: FLIP_MS, easing: 'cubic-bezier(0.45, 0.05, 0.22, 1)', fill: 'forwards' }
  const anim = sheet.animate(
    forward
      ? [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }]
      : [{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }],
    opts,
  )
  // 들리는 면은 빛에서 멀어지며 어두워지고, 내려앉는 면은 밝아진다
  const lift = forward ? frontShade : backShade
  const land = forward ? backShade : frontShade
  lift.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.5 }, { opacity: 1 }], opts)
  land.animate([{ opacity: 1 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0 }], opts)
  // 내려앉기 직전 종이 그림자가 바닥에 드리운다
  cast?.animate(
    [
      { opacity: 0 },
      { opacity: 0.2, offset: 0.5 },
      { opacity: 1, offset: 0.85 },
      { opacity: 0 },
    ],
    opts,
  )

  const finish = () => {
    flipCleanup = null
    overlay.remove()
  }
  flipCleanup = finish
  anim.onfinish = finish
  anim.oncancel = finish
  return true
}

function pageOfX(x) {
  return Math.min(numPages.value - 1, Math.max(0, Math.floor(x / step + 0.02)))
}

function setupPaged() {
  pagedActive.value = isPagedViewport() && !isHome.value
  document.documentElement.classList.toggle('fc-paged', pagedActive.value)
  if (!pagedActive.value) {
    document.documentElement.classList.remove('fc-two')
    scroller = null
    cardRect.value = null
    isBookmarked.value = false
    return
  }
  window.scrollTo(0, 0)
  scroller = document.querySelector('.VPDoc .content-container')
  if (!scroller) return
  // 자리가 넉넉하면 두 페이지 펼침 (카드 폭이 커지므로 열 수 지정 전에 판단)
  const avail = document.querySelector('.VPDoc .container')?.clientWidth ?? 0
  document.documentElement.classList.toggle('fc-two', avail >= 1020)
  cardRect.value = scroller.parentElement?.getBoundingClientRect() ?? null
  measure()
  updateBookmarkState()
  try {
    if (sessionStorage.getItem(OPEN_LAST_KEY)) {
      sessionStorage.removeItem(OPEN_LAST_KEY)
      curPage.value = numPages.value - 1
      applyPage(false)
      return
    }
  } catch {}
  if (location.hash) jumpToHash(location.hash)
}

function goChapter(dir) {
  const link = document.querySelector(`.pager-link.${dir}`)
  if (!link) return
  // 이전 장으로 갈 때는 책처럼 그 장의 마지막 페이지에서 시작한다
  if (dir === 'prev') {
    try {
      sessionStorage.setItem(OPEN_LAST_KEY, '1')
    } catch {}
  }
  link.click()
}

function turnPage(dir) {
  if (!pagedActive.value) {
    goChapter(dir > 0 ? 'next' : 'prev')
    return
  }
  measure()
  const target = curPage.value + dir
  if (target < 0) return goChapter('prev')
  if (target > numPages.value - 1) return goChapter('next')
  const from = curPage.value
  curPage.value = target
  if (!animateFlip(from, target)) applyPage()
}

// 본문 안 앵커 링크(검색 결과 등)를 누르면 해당 제목이 있는 페이지로 넘긴다
function jumpToHash(hash) {
  if (!pagedActive.value || !scroller || !step) return
  const id = decodeURIComponent((hash || '').replace(/^#/, ''))
  if (!id) return
  // 한글 id는 NFC/NFD 표기가 섞일 수 있다 (VitePress 슬러그는 원문 표기를 따른다)
  const el =
    document.getElementById(id) ??
    document.getElementById(id.normalize('NFC')) ??
    document.getElementById(id.normalize('NFD'))
  if (!el) return
  curPage.value = pageOfX(elX(el))
  applyPage(false)
}

function onHashChange() {
  jumpToHash(location.hash)
}

// 휠·트랙패드로 페이지 넘기기 (장 경계는 넘지 않는다)
let wheelAcc = 0
let wheelAt = 0
let wheelLockUntil = 0

function onWheel(e) {
  if (!pagedActive.value || e.ctrlKey) return
  if (e.target.closest('.VPNav, .VPSidebar, .VPLocalSearchBox, .fc-panel')) return
  const now = e.timeStamp
  if (now < wheelLockUntil) return
  if (now - wheelAt > 300) wheelAcc = 0
  wheelAt = now
  wheelAcc += e.deltaY
  if (Math.abs(wheelAcc) < 80) return
  const dir = wheelAcc > 0 ? 1 : -1
  wheelAcc = 0
  wheelLockUntil = now + 450
  const target = curPage.value + dir
  if (target < 0 || target > numPages.value - 1) return
  const from = curPage.value
  curPage.value = target
  if (!animateFlip(from, target)) applyPage()
}

// 읽기 진행 바 — 페이지 모드에서는 페이지 비율, 스크롤 모드에서는 스크롤 비율
const scrollProgress = ref(0)

function onScroll() {
  const el = document.documentElement
  const max = el.scrollHeight - el.clientHeight
  scrollProgress.value = max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0
}

const progress = computed(() => {
  if (!pagedActive.value) return scrollProgress.value
  return numPages.value > 1 ? ((curPage.value + 1) / numPages.value) * 100 : 100
})

// 페이지 번호 표시 — 펼침이면 "3–4 / 52"
const pageLabel = computed(() => {
  if (cols.value === 2) {
    const left = curPage.value * 2 + 1
    const right = Math.min(left + 1, totalCols.value)
    return `${left === right ? left : `${left}–${right}`} / ${totalCols.value}`
  }
  return `${curPage.value + 1} / ${numPages.value}`
})

// 좌우 화살표 — 하단 페이저의 이전/다음 장 링크를 읽어 온다
const prevHref = ref('')
const nextHref = ref('')

function updatePager() {
  prevHref.value = document.querySelector('.pager-link.prev')?.getAttribute('href') ?? ''
  nextHref.value = document.querySelector('.pager-link.next')?.getAttribute('href') ?? ''
}

const hasPrev = computed(() => curPage.value > 0 || !!prevHref.value)
const hasNext = computed(() => curPage.value < numPages.value - 1 || !!nextHref.value)

// ── 북마크 ────────────────────────────────────────────────────
// 현재 펼침면에서 시작하는 첫 블록 요소를 기준점으로 저장한다.
// 창 크기가 바뀌어도 그 요소가 있는 페이지로 되돌아갈 수 있다.
const BM_KEY = `${PREFIX}-bookmarks`
const bookmarks = ref([])
const isBookmarked = ref(false)

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

function elX(el) {
  if (!scroller) return 0
  return el.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft
}

function resolveBookmarkEl(rec) {
  const root = docRoot()
  if (!root) return null
  const els = blockAnchors(root)
  const snip = (e) => (e.textContent || '').slice(0, 40)
  let el = els[rec.anchor.idx]
  if (!el || (rec.anchor.text && snip(el) !== rec.anchor.text)) {
    el = els.find((e) => rec.anchor.text && snip(e) === rec.anchor.text) ?? el ?? null
  }
  return el
}

function resolveBookmarkPage(rec) {
  const el = resolveBookmarkEl(rec)
  if (!el) return -1
  const p = pageOfX(elX(el)) + (rec.anchor.dpage || 0)
  return Math.min(numPages.value - 1, Math.max(0, p))
}

function updateBookmarkState() {
  if (!pagedActive.value || !scroller) {
    isBookmarked.value = false
    return
  }
  isBookmarked.value = bookmarks.value.some(
    (b) => b.path === location.pathname && resolveBookmarkPage(b) === curPage.value,
  )
}

function toggleBookmark() {
  if (!pagedActive.value || !scroller) return
  const onThis = bookmarks.value.filter(
    (b) => b.path === location.pathname && resolveBookmarkPage(b) === curPage.value,
  )
  if (onThis.length) {
    bookmarks.value = bookmarks.value.filter((b) => !onThis.includes(b))
  } else {
    const root = docRoot()
    if (!root) return
    const els = blockAnchors(root)
    // 현재 펼침면에서 시작하는 첫 요소. 펼침면 전체가 하나의 긴 요소
    // (예: 코드 블록) 안이면 그 요소를 기준으로 페이지 차이를 기록한다.
    let pick = null
    let pickIdx = -1
    let spanIdx = -1
    for (let i = 0; i < els.length; i++) {
      const p = pageOfX(elX(els[i]))
      if (p === curPage.value) {
        pick = els[i]
        pickIdx = i
        break
      }
      if (p < curPage.value) spanIdx = i
      if (p > curPage.value) break
    }
    if (!pick && spanIdx >= 0) {
      pick = els[spanIdx]
      pickIdx = spanIdx
    }
    if (!pick) return
    bookmarks.value = [
      ...bookmarks.value,
      {
        id: uid(),
        path: location.pathname,
        title: page.value.title,
        anchor: {
          idx: pickIdx,
          text: (pick.textContent || '').slice(0, 40),
          dpage: curPage.value - pageOfX(elX(pick)),
        },
        at: Date.now(),
      },
    ]
  }
  saveList(BM_KEY, bookmarks.value)
  updateBookmarkState()
}

function removeBookmark(id) {
  bookmarks.value = bookmarks.value.filter((b) => b.id !== id)
  saveList(BM_KEY, bookmarks.value)
  updateBookmarkState()
}

// ── 형광펜 ────────────────────────────────────────────────────
// CSS Custom Highlight API로 칠한다. DOM을 바꾸지 않으므로 Vue가
// 관리하는 본문과 충돌하지 않는다.
const HL_KEY = `${PREFIX}-highlights`
const HL_COLORS = ['yellow', 'green', 'pink']
const highlights = ref([])
const selTool = ref(null) // { mode: 'new' | 'edit', x, y, id? }
let pendingRange = null
let liveRanges = [] // 현재 문서에 그려진 형광펜 [{ id, color, range }]

function highlightSupported() {
  return typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && CSS.highlights
}

function paintHighlights() {
  if (!highlightSupported()) return
  for (const c of HL_COLORS) CSS.highlights.delete(`fc-hl-${c}`)
  liveRanges = []
  const root = docRoot()
  if (!root) return
  const byColor = {}
  for (const rec of highlights.value) {
    if (rec.path !== location.pathname) continue
    const range = findRange(root, rec)
    if (!range) continue
    liveRanges.push({ id: rec.id, color: rec.color, range })
    ;(byColor[rec.color] ??= []).push(range)
  }
  for (const [c, ranges] of Object.entries(byColor)) {
    CSS.highlights.set(`fc-hl-${c}`, new Highlight(...ranges))
  }
}

function onSelectionEnd(e) {
  if (e.target instanceof Element && e.target.closest('.fc-seltool')) return
  // click 이벤트가 지나간 뒤에 선택 상태를 읽는다
  setTimeout(() => {
    if (!highlightSupported()) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const root = docRoot()
    if (!root || !root.contains(range.commonAncestorContainer)) return
    if (!range.toString().trim()) return
    pendingRange = range.cloneRange()
    const rect = range.getBoundingClientRect()
    selTool.value = {
      mode: 'new',
      x: Math.min(Math.max(rect.left + rect.width / 2 - 72, 8), window.innerWidth - 190),
      y: Math.max(rect.top - 48, 8),
    }
  }, 0)
}

function addHighlight(color) {
  const root = docRoot()
  if (!root || !pendingRange) return
  const ser = serializeRange(root, pendingRange)
  if (!ser) return
  highlights.value = [
    ...highlights.value,
    { id: uid(), path: location.pathname, title: page.value.title, color, at: Date.now(), ...ser },
  ]
  saveList(HL_KEY, highlights.value)
  window.getSelection()?.removeAllRanges()
  pendingRange = null
  selTool.value = null
  paintHighlights()
}

function recolorHighlight(id, color) {
  highlights.value = highlights.value.map((h) => (h.id === id ? { ...h, color } : h))
  saveList(HL_KEY, highlights.value)
  selTool.value = null
  paintHighlights()
}

function removeHighlight(id) {
  highlights.value = highlights.value.filter((h) => h.id !== id)
  saveList(HL_KEY, highlights.value)
  selTool.value = null
  paintHighlights()
}

function onSelToolPick(color) {
  if (selTool.value?.mode === 'edit') recolorHighlight(selTool.value.id, color)
  else addHighlight(color)
}

// ── 북마크·형광펜 패널 ────────────────────────────────────────
const panelOpen = ref(false)
const sortedBookmarks = computed(() => [...bookmarks.value].sort((a, b) => b.at - a.at))
const sortedHighlights = computed(() => [...highlights.value].sort((a, b) => b.at - a.at))

function openItem(type, rec) {
  panelOpen.value = false
  if (rec.path === location.pathname) {
    jumpNow(type, rec)
    return
  }
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ type, id: rec.id }))
  } catch {}
  router.go(rec.path)
}

function jumpNow(type, rec) {
  if (type === 'bm') {
    const el = resolveBookmarkEl(rec)
    if (!el) return
    if (pagedActive.value) {
      curPage.value = resolveBookmarkPage(rec)
      applyPage(false)
      updateBookmarkState()
    } else {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  } else {
    const root = docRoot()
    const range = root && findRange(root, rec)
    if (!range) return
    if (pagedActive.value) {
      curPage.value = pageOfX(
        range.getBoundingClientRect().left -
          scroller.getBoundingClientRect().left +
          scroller.scrollLeft,
      )
      applyPage(false)
    } else {
      range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }
}

function consumePending() {
  let raw = null
  try {
    raw = sessionStorage.getItem(PENDING_KEY)
    if (raw) sessionStorage.removeItem(PENDING_KEY)
  } catch {}
  if (!raw) return
  try {
    const { type, id } = JSON.parse(raw)
    const rec = (type === 'bm' ? bookmarks : highlights).value.find((r) => r.id === id)
    if (rec) jumpNow(type, rec)
  } catch {}
}

// ── 전역 이벤트 ───────────────────────────────────────────────
function onClick(e) {
  const t = e.target instanceof Element ? e.target : null
  if (t && t.closest('.fc-seltool, .fc-panel, .fc-panel-btn, .fc-ribbon')) return
  if (selTool.value) selTool.value = null
  if (panelOpen.value) panelOpen.value = false
  // 형광펜을 클릭하면 색 바꾸기/삭제 팝업
  const sel = window.getSelection()
  if ((!sel || sel.isCollapsed) && t && t.closest('.vp-doc')) {
    for (const lr of liveRanges) {
      for (const r of lr.range.getClientRects()) {
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          selTool.value = {
            mode: 'edit',
            id: lr.id,
            x: Math.min(Math.max(e.clientX - 72, 8), window.innerWidth - 190),
            y: Math.max(e.clientY - 52, 8),
          }
          return
        }
      }
    }
  }
  // 같은 문서 안 앵커 링크 → 해당 페이지로
  if (!pagedActive.value) return
  const a = t && t.closest('a[href]')
  if (!a || a.target === '_blank') return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return
  // VitePress의 scrollIntoView가 끝난 뒤 페이지 경계에 다시 맞춘다
  setTimeout(() => jumpToHash(url.hash), 100)
}

// ←/→ 키로 페이지·장 이동
function onKey(e) {
  if (e.key === 'Escape') {
    selTool.value = null
    panelOpen.value = false
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
  // 입력 중이거나 검색창 등이 열려 있으면 페이지를 넘기지 않는다
  const t = e.target
  if (
    t instanceof Element &&
    (t.isContentEditable || t.closest('input, textarea, select, [contenteditable]'))
  )
    return
  if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    e.preventDefault()
    turnPage(1)
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault()
    turnPage(-1)
  } else if (pagedActive.value && e.key === 'Home') {
    const from = curPage.value
    curPage.value = 0
    if (!animateFlip(from, 0)) applyPage()
  } else if (pagedActive.value && e.key === 'End') {
    const from = curPage.value
    curPage.value = numPages.value - 1
    if (!animateFlip(from, curPage.value)) applyPage()
  }
}

function onResize() {
  setupPaged()
}

function refresh() {
  onScroll()
  updatePager()
  setupPaged()
  paintHighlights()
  consumePending()
  updateBookmarkState()
}

onMounted(() => {
  migrateLegacyKeys(ebookCfg.legacyPrefixes ?? [], PREFIX)
  try {
    tocHidden.value = localStorage.getItem(TOC_KEY) === '1'
  } catch {}
  bookmarks.value = loadList(BM_KEY)
  highlights.value = loadList(HL_KEY)
  applyTocState()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  window.addEventListener('hashchange', onHashChange)
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('mouseup', onSelectionEnd)
  window.addEventListener('touchend', onSelectionEnd)
  document.addEventListener('click', onClick)
  nextTick(refresh)
  // 웹폰트가 늦게 적용되면 줄바꿈이 달라져 페이지 수가 바뀐다
  document.fonts?.ready?.then(() =>
    setTimeout(() => {
      measure()
      paintHighlights()
      updateBookmarkState()
    }, 0),
  )
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('mouseup', onSelectionEnd)
  window.removeEventListener('touchend', onSelectionEnd)
  document.removeEventListener('click', onClick)
  flipCleanup?.()
  document.documentElement.classList.remove('fc-paged', 'fc-two')
})

watch(curPage, () => {
  selTool.value = null
  updateBookmarkState()
})

watch(
  () => route.path,
  async () => {
    curPage.value = 0
    selTool.value = null
    panelOpen.value = false
    await nextTick()
    requestAnimationFrame(refresh)
    setTimeout(refresh, 300)
  },
)
</script>

<template>
  <div v-if="!isHome" class="fc-progress" :style="{ width: progress + '%' }" />
  <DefaultTheme.Layout>
    <template #nav-bar-content-before>
      <button
        v-if="!isHome"
        class="fc-toc-toggle"
        type="button"
        :title="tocHidden ? '목차 펼치기' : '목차 접기'"
        :aria-pressed="!tocHidden"
        @click="toggleToc"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="14" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
        <span>목차</span>
      </button>
      <button
        v-if="!isHome"
        class="fc-toc-toggle fc-panel-btn"
        type="button"
        title="북마크와 형광펜"
        :aria-expanded="panelOpen"
        @click="panelOpen = !panelOpen"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <path d="M6 3h12v18l-6-4.5L6 21z" />
        </svg>
        <span>책갈피</span>
      </button>
    </template>
    <template #layout-bottom>
      <button
        v-if="!isHome && hasPrev"
        class="fc-arrow prev"
        type="button"
        aria-label="이전 페이지"
        @click="turnPage(-1)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        v-if="!isHome && hasNext"
        class="fc-arrow next"
        type="button"
        aria-label="다음 페이지"
        @click="turnPage(1)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div v-if="!isHome && pagedActive" class="fc-page-num">{{ pageLabel }}</div>

      <!-- 북마크 리본 — 페이지 카드 오른쪽 위 -->
      <button
        v-if="!isHome && pagedActive && cardRect"
        class="fc-ribbon"
        :class="{ active: isBookmarked }"
        type="button"
        :title="isBookmarked ? '북마크 해제' : '이 페이지 북마크'"
        :style="{ left: cardRect.right - 64 + 'px', top: cardRect.top - 1 + 'px' }"
        @click="toggleBookmark"
      >
        <svg width="22" height="30" viewBox="0 0 24 32" :fill="isBookmarked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <path d="M4 1h16v29l-8-6.5L4 30z" />
        </svg>
      </button>

      <!-- 형광펜 선택 도구 -->
      <div v-if="selTool" class="fc-seltool" :style="{ left: selTool.x + 'px', top: selTool.y + 'px' }">
        <button
          v-for="c in HL_COLORS"
          :key="c"
          class="fc-hl-dot"
          :class="c"
          type="button"
          :title="selTool.mode === 'edit' ? '색 바꾸기' : '형광펜'"
          @click="onSelToolPick(c)"
        />
        <button v-if="selTool.mode === 'edit'" class="fc-hl-del" type="button" @click="removeHighlight(selTool.id)">
          삭제
        </button>
      </div>

      <!-- 북마크·형광펜 패널 -->
      <div v-if="panelOpen && !isHome" class="fc-panel">
        <div class="fc-panel-section">북마크</div>
        <p v-if="!sortedBookmarks.length" class="fc-panel-empty">
          페이지 오른쪽 위 리본을 누르면 이 자리에 저장됩니다.
        </p>
        <ul v-else class="fc-panel-list">
          <li v-for="b in sortedBookmarks" :key="b.id">
            <button class="fc-panel-item" type="button" @click="openItem('bm', b)">
              <span class="fc-panel-item-title">{{ b.title }}</span>
              <span class="fc-panel-item-text">{{ b.anchor.text }}</span>
            </button>
            <button class="fc-panel-x" type="button" aria-label="북마크 삭제" @click="removeBookmark(b.id)">×</button>
          </li>
        </ul>
        <div class="fc-panel-section">형광펜</div>
        <p v-if="!sortedHighlights.length" class="fc-panel-empty">
          본문을 드래그하면 형광펜을 칠할 수 있습니다.
        </p>
        <ul v-else class="fc-panel-list">
          <li v-for="h in sortedHighlights" :key="h.id">
            <button class="fc-panel-item" type="button" @click="openItem('hl', h)">
              <span class="fc-panel-item-title"><i class="fc-hl-dot small" :class="h.color" />{{ h.title }}</span>
              <span class="fc-panel-item-text">{{ h.text.slice(0, 64) }}</span>
            </button>
            <button class="fc-panel-x" type="button" aria-label="형광펜 삭제" @click="removeHighlight(h.id)">×</button>
          </li>
        </ul>
      </div>
    </template>
  </DefaultTheme.Layout>
</template>
