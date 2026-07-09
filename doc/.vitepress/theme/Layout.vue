<script setup>
import DefaultTheme from 'vitepress/theme'
import { useData, useRoute } from 'vitepress'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const { page } = useData()
const route = useRoute()
const isHome = computed(() => page.value.relativePath === 'index.md')

// 목차(왼쪽 사이드바) 접기/펼치기 — 이북 뷰어의 몰입 모드
const tocHidden = ref(false)

function applyTocState() {
  document.documentElement.classList.toggle('ef-toc-hidden', tocHidden.value)
}

function toggleToc() {
  tocHidden.value = !tocHidden.value
  applyTocState()
  try {
    localStorage.setItem('ef-toc-hidden', tocHidden.value ? '1' : '')
  } catch {}
  // 본문 폭이 바뀌므로 페이지를 다시 계산한다
  nextTick(() => setTimeout(setupPaged, 50))
}

// ── 페이지 넘김 모드 ──────────────────────────────────────────
// 데스크톱에서는 장을 아래로 스크롤하지 않고, 본문을 CSS 다단으로
// 흘려 한 화면을 넘는 내용이 오른쪽 열(다음 페이지)로 이어지게 한다.
// 페이지 넘김 = 다단 컨테이너를 열 너비만큼 가로 스크롤.
const pagedActive = ref(false)
const curPage = ref(0)
const numPages = ref(1)
let scroller = null // .content-container — 다단 + overflow hidden
let step = 0 // 페이지 하나의 폭(열 너비 + 열 간격)

function isPagedViewport() {
  return window.matchMedia('(min-width: 960px)').matches
}

function measure() {
  if (!scroller) return
  const gap = parseFloat(getComputedStyle(scroller).columnGap) || 0
  step = scroller.clientWidth + gap
  numPages.value =
    step > 0
      ? Math.max(1, Math.round((scroller.scrollWidth - scroller.clientWidth) / step) + 1)
      : 1
  if (curPage.value > numPages.value - 1) curPage.value = numPages.value - 1
  applyPage(false)
}

function applyPage(smooth = true) {
  scroller?.scrollTo({ left: curPage.value * step, behavior: smooth ? 'smooth' : 'auto' })
}

function setupPaged() {
  pagedActive.value = isPagedViewport() && !isHome.value
  document.documentElement.classList.toggle('ef-paged', pagedActive.value)
  if (!pagedActive.value) {
    scroller = null
    return
  }
  window.scrollTo(0, 0)
  scroller = document.querySelector('.VPDoc .content-container')
  measure()
  try {
    if (sessionStorage.getItem('ef-open-last')) {
      sessionStorage.removeItem('ef-open-last')
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
      sessionStorage.setItem('ef-open-last', '1')
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
  curPage.value = target
  applyPage()
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
  const x =
    el.getBoundingClientRect().left -
    scroller.getBoundingClientRect().left +
    scroller.scrollLeft
  curPage.value = Math.min(numPages.value - 1, Math.max(0, Math.round(x / step)))
  applyPage(false)
}

function onClick(e) {
  if (!pagedActive.value) return
  const a = e.target.closest('a[href]')
  if (!a || a.target === '_blank') return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return
  // VitePress의 scrollIntoView가 끝난 뒤 페이지 경계에 다시 맞춘다
  setTimeout(() => jumpToHash(url.hash), 100)
}

// 휠·트랙패드로 페이지 넘기기 (장 경계는 넘지 않는다)
let wheelAcc = 0
let wheelAt = 0
let wheelLockUntil = 0

function onWheel(e) {
  if (!pagedActive.value || e.ctrlKey) return
  if (e.target.closest('.VPNav, .VPSidebar, .VPLocalSearchBox')) return
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
  curPage.value = target
  applyPage()
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

// 좌우 화살표 — 하단 페이저의 이전/다음 장 링크를 읽어 온다
const prevHref = ref('')
const nextHref = ref('')

function updatePager() {
  prevHref.value = document.querySelector('.pager-link.prev')?.getAttribute('href') ?? ''
  nextHref.value = document.querySelector('.pager-link.next')?.getAttribute('href') ?? ''
}

const hasPrev = computed(() => curPage.value > 0 || !!prevHref.value)
const hasNext = computed(() => curPage.value < numPages.value - 1 || !!nextHref.value)

// ←/→ 키로 페이지·장 이동
function onKey(e) {
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
    curPage.value = 0
    applyPage()
  } else if (pagedActive.value && e.key === 'End') {
    curPage.value = numPages.value - 1
    applyPage()
  }
}

function onResize() {
  setupPaged()
}

function onHashChange() {
  jumpToHash(location.hash)
}

function refresh() {
  onScroll()
  updatePager()
  setupPaged()
}

onMounted(() => {
  try {
    tocHidden.value = localStorage.getItem('ef-toc-hidden') === '1'
  } catch {}
  applyTocState()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  window.addEventListener('hashchange', onHashChange)
  window.addEventListener('wheel', onWheel, { passive: true })
  document.addEventListener('click', onClick)
  nextTick(refresh)
  // 웹폰트가 늦게 적용되면 줄바꿈이 달라져 페이지 수가 바뀐다
  document.fonts?.ready?.then(() => setTimeout(measure, 0))
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('wheel', onWheel)
  document.removeEventListener('click', onClick)
  document.documentElement.classList.remove('ef-paged')
})

watch(
  () => route.path,
  async () => {
    curPage.value = 0
    await nextTick()
    requestAnimationFrame(refresh)
    setTimeout(refresh, 300)
  },
)
</script>

<template>
  <div v-if="!isHome" class="ef-progress" :style="{ width: progress + '%' }" />
  <DefaultTheme.Layout>
    <template #nav-bar-content-before>
      <button
        v-if="!isHome"
        class="ef-toc-toggle"
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
    </template>
    <template #layout-bottom>
      <button
        v-if="!isHome && hasPrev"
        class="ef-arrow prev"
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
        class="ef-arrow next"
        type="button"
        aria-label="다음 페이지"
        @click="turnPage(1)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div v-if="!isHome && pagedActive" class="ef-page-num">{{ curPage + 1 }} / {{ numPages }}</div>
    </template>
  </DefaultTheme.Layout>
</template>
