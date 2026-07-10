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
        items: [
          { text: '무엇을 만드는가: Echo Flip의 요구사항', link: '/intro' },
          { text: '1장 기술 선택: 왜 이 조합인가', link: '/part1/tech-choices' },
        ],
      },
      {
        text: '1부 내 컴퓨터에서 웹 앱 완성하기',
        items: [
          { text: '2장 데이터베이스 기초: 테이블, SQL, 인덱스', link: '/part1/database-basics' },
          { text: '3장 데이터베이스 설계: 요구사항에서 테이블로', link: '/part1/database' },
          { text: '4장 Go 기초: 모듈, 변수, 함수', link: '/part1/go-basics' },
          { text: '5장 Go 코드 읽기: 구조체, 포인터, 에러 처리', link: '/part1/go' },
          { text: '6장 Go 테스트와 품질 도구', link: '/part1/go-testing' },
          { text: '7장 Gin으로 만드는 HTTP API', link: '/part1/gin' },
          { text: '8장 TypeScript: 타입으로 지키는 프런트엔드', link: '/part1/typescript' },
          { text: '9장 TypeScript 실전: 비동기 처리와 런타임 검증', link: '/part1/typescript-async' },
          { text: '10장 React 기초: 컴포넌트, 상태, 훅', link: '/part1/react' },
          { text: '11장 React 실전과 Next.js: 전역 상태와 정적 export', link: '/part1/react-next' },
          { text: '12장 Claude Code: AI 에이전트와 개발하기', link: '/part1/claude-code' },
          { text: '13장 서브에이전트와 훅으로 만드는 품질 게이트', link: '/part1/agents-hooks' },
          { text: '14장 로컬 개발 환경: 내 컴퓨터에서 앱 완성하기', link: '/part1/local-dev' },
        ],
      },
      {
        text: '2부 세상에 공개하고 오래 운영하기',
        items: [
          { text: '15장 Git: 개념과 브랜치 정책', link: '/part2/git' },
          { text: '16장 GitHub Actions: 원격 품질 게이트', link: '/part2/github-actions' },
          { text: '17장 Vercel: 한 플랫폼에 모두 배포하기', link: '/part2/vercel' },
          { text: '18장 Supabase 인증: OAuth와 JWKS 검증', link: '/part2/supabase-auth' },
          { text: '19장 Supabase 데이터베이스: pgx 연결과 개발·운영 DB 분리', link: '/part2/supabase-db' },
          { text: '20장 PWA: 설치되는 앱으로 만들기', link: '/part2/pwa' },
          { text: '21장 무료 티어 운영과 한도 관리', link: '/part2/free-tier' },
          { text: '22장 다음 단계: 여기서 더 공부할 것들', link: '/part2/whats-next' },
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
