import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'ko-KR',
  title: '월 0원으로 운영하는 나의 웹 앱',
  description:
    '혼자 만들고, 무료로 배포하고, AI와 함께 개발한다. 작은 웹 앱의 실제 코드로 Go, Gin, TypeScript, React, PostgreSQL을 익히고 Vercel·Supabase 무료 티어로 서버 비용 없이 운영하는 과정을 배운다.',
  base: '/echo-flip/',
  srcExclude: ['book-plan.md'],
  cleanUrls: true,
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;600;700&display=swap',
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: '홈', link: '/' },
      { text: '읽기 시작', link: '/intro' },
      { text: 'PDF 다운로드', link: 'https://benelog.github.io/echo-flip/echo-flip-book.pdf' },
    ],
    sidebar: [
      {
        text: '도입',
        items: [{ text: '무엇을 만드는가: Echo Flip의 요구사항', link: '/intro' }],
      },
      {
        text: '1부 언어와 프레임워크로 코드 이해하기',
        items: [
          { text: '1장 기술 선택: 왜 이 조합인가', link: '/part1/tech-choices' },
          { text: '2장 Go 기초: 모듈, 변수, 함수', link: '/part1/go-basics' },
          { text: '3장 Go 코드 읽기: 구조체, 포인터, 에러 처리', link: '/part1/go' },
          { text: '4장 Go 테스트와 품질 도구', link: '/part1/go-testing' },
          { text: '5장 Gin으로 만드는 HTTP API', link: '/part1/gin' },
          { text: '6장 TypeScript: 타입으로 지키는 프런트엔드', link: '/part1/typescript' },
          { text: '7장 TypeScript 실전: 비동기 처리와 런타임 검증', link: '/part1/typescript-async' },
          { text: '8장 React와 Next.js로 만드는 화면', link: '/part1/react' },
          { text: '9장 PostgreSQL 데이터베이스 설계', link: '/part1/database' },
        ],
      },
      {
        text: '2부 에이전트와 인프라로 앱 만들고 운영하기',
        items: [
          { text: '10장 Claude Code: AI 에이전트와 개발하기', link: '/part2/claude-code' },
          { text: '11장 서브에이전트와 훅으로 만드는 품질 게이트', link: '/part2/agents-hooks' },
          { text: '12장 Vercel: 한 플랫폼에 모두 배포하기', link: '/part2/vercel' },
          { text: '13장 Supabase: 인증과 데이터베이스', link: '/part2/supabase' },
        ],
      },
    ],
    outline: false,
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
