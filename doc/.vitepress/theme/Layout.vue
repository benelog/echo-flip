<script setup>
import DefaultTheme from 'vitepress/theme'
import { useData, useRoute } from 'vitepress'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const { frontmatter } = useData()
const route = useRoute()
const isHome = computed(() => frontmatter.value.layout === 'home')

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
}

// 읽기 진행 바
const progress = ref(0)

function onScroll() {
  const el = document.documentElement
  const max = el.scrollHeight - el.clientHeight
  progress.value = max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0
}

// ←/→ 키로 장 이동
function onKey(e) {
  if (e.target !== document.body || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
  if (e.key === 'ArrowRight') document.querySelector('.pager-link.next')?.click()
  if (e.key === 'ArrowLeft') document.querySelector('.pager-link.prev')?.click()
}

onMounted(() => {
  try {
    tocHidden.value = localStorage.getItem('ef-toc-hidden') === '1'
  } catch {}
  applyTocState()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
  onScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKey)
})

watch(
  () => route.path,
  () => requestAnimationFrame(onScroll),
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
  </DefaultTheme.Layout>
</template>
