import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'ko-KR',
  title: 'Echo Flip으로 배우는 풀스택 개발',
  description:
    '작은 암기 카드 앱 하나로 Go, Gin, TypeScript, React, PostgreSQL과 Vercel·Supabase 배포, 그리고 Claude Code를 활용한 개발까지 배운다.',
  base: '/echo-flip/',
  srcExclude: ['book-plan.md'],
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: '홈', link: '/' },
      { text: '읽기 시작', link: '/intro' },
    ],
    sidebar: [
      {
        text: '도입',
        items: [{ text: '무엇을 만드는가 — Echo Flip의 요구사항', link: '/intro' }],
      },
      {
        text: '1부 언어와 프레임워크로 코드 이해하기',
        items: [
          { text: '1장 Go — 작은 서버를 위한 백엔드 언어', link: '/part1/go' },
          { text: '2장 Gin으로 만드는 HTTP API', link: '/part1/gin' },
          { text: '3장 TypeScript — 타입으로 지키는 프런트엔드', link: '/part1/typescript' },
          { text: '4장 React와 Next.js로 만드는 화면', link: '/part1/react' },
          { text: '5장 PostgreSQL 데이터베이스 설계', link: '/part1/database' },
        ],
      },
      {
        text: '2부 앱을 만드는 도구와 인프라',
        items: [
          { text: '6장 Claude Code — AI 에이전트와 개발하기', link: '/part2/claude-code' },
          { text: '7장 서브에이전트와 훅으로 만드는 품질 게이트', link: '/part2/agents-hooks' },
          { text: '8장 Vercel — 한 플랫폼에 모두 배포하기', link: '/part2/vercel' },
          { text: '9장 Supabase — 인증과 데이터베이스', link: '/part2/supabase' },
        ],
      },
    ],
    outline: { level: [2, 3], label: '이 페이지에서' },
    docFooter: { prev: '이전 장', next: '다음 장' },
    lastUpdated: { text: '마지막 수정' },
    darkModeSwitchLabel: '다크 모드',
    sidebarMenuLabel: '목차',
    returnToTopLabel: '맨 위로',
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '검색', buttonAriaLabel: '검색' },
          modal: {
            noResultsText: '결과가 없습니다',
            resetButtonTitle: '초기화',
            footer: { selectText: '선택', navigateText: '이동', closeText: '닫기' },
          },
        },
      },
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/benelog/echo-flip' }],
  },
})
