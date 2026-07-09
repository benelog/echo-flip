# 책 작업 계획과 진도표 (book-plan.md)

Echo Flip 앱을 소재로 한 기술서를 `doc/` 아래에 VitePress로 집필해 GitHub Pages로 배포한다.
이 파일은 세션이 끊겨도 이어서 작업할 수 있도록 계획·진행 상태·집필 규칙을 기록한다.
사이트 빌드에서는 제외된다(`.vitepress/config.ts`의 `srcExclude`).

## 책 개요

- 제목: **월 0원으로 운영하는 나의 웹 앱** — 부제: 혼자 만들고, 무료로 배포하고, AI와 함께 개발한다
  - 2026-07-09 변경. 이전 제목 "Echo Flip으로 배우는 풀스택 개발"은 폐기(독자가 Echo Flip을 모르고 '풀스택'이 진부하다는 피드백). 제목에 Echo Flip·풀스택 단어를 쓰지 않는다.
- 목적: 이 앱의 모든 코드를 해설하는 책이 아니다. 비슷한 앱을 직접 만들 수 있도록 언어·프레임워크·배포 인프라 지식을 이 앱의 실제 코드 예제로 전달한다.
- 각 기술의 **선택 이유(트레이드오프)** 를 반드시 다룬다: 왜 Go인가, 왜 TypeScript·React인가, 왜 Vercel·Supabase인가.
- 배포: GitHub Pages (https://benelog.github.io/echo-flip/), `.github/workflows/book.yml`이 `doc/**` 변경 push 시 자동 배포.
  - Pages Source는 GitHub Actions로 설정 완료(2026-07-09, `gh api repos/benelog/echo-flip/pages -X POST -f build_type=workflow`).

## 기술 구성

- SSG: **VitePress** (선택 이유: 앱과 동일한 npm 스택이라 도구 추가 부담 없음, 마크다운 기반, 한국어 로컬 검색 내장, GitHub Pages 배포 단순)
- 소스 위치: `doc/` (독립 `package.json`, 앱 의존성과 분리)
- 로컬 확인: `cd doc && npm install && npm run dev` / 빌드 검증: `npm run build`
- 책 테마 (2026-07-09): `.vitepress/theme/custom.css` — 본문 명조(Noto Serif KR)·제목 고딕의 한국어 종이책 관례, 행간 2.05·양쪽 정렬, 인쇄용 CSS 포함
- 이북 뷰어 레이아웃 (2026-07-09): 오른쪽 아웃라인 제거(목차는 왼쪽 하나만), 상단 바 "목차" 버튼으로 사이드바 접기/펼치기(localStorage 유지), 본문은 회색 배경 위 중앙 페이지 카드, 상단 읽기 진행 바, 화면 좌우 화살표 버튼과 ←/→ 키로 장 이동(Google Play 북스식). 홈(`index.md`)은 `layout: page` 기반 책 표지 랜딩. `.vitepress/theme/Layout.vue`(DefaultTheme 확장) + `custom.css`
- 폰트 (2026-07-09): 본문 Noto Serif KR, 제목·UI는 `--vp-font-family-base`에 Noto Sans KR 웹폰트 포함. 한글 폰트가 없는 CI 러너에서 PDF의 제목·코드 주석 한글이 깨지던 문제를 웹폰트 폴백 + book.yml의 fonts-noto-cjk 설치로 해결
- 표현 원칙 (2026-07-09 지시): Echo Flip은 "영어 암기 앱"이 아니라 **"암기 카드 앱"**으로 표현한다. 영어 단어·숙어·문장뿐 아니라 용어·개념 설명에도 쓸 수 있다는 것이 상세 설명. TTS·사전 자동 채우기 등은 부가 기능으로 소개
- PDF (2026-07-09): `npm run pdf`(`scripts/export-pdf.mjs`)가 표지·차례(쪽 번호 포함)를 생성하고 빌드 결과를 장 순서대로 인쇄해 `dist/echo-flip-book.pdf` 한 권으로 병합(시스템 Chrome + puppeteer-core + pdf-lib). 본문에만 연속 쪽 번호, 장별 북마크(PDF 아웃라인) 포함. CI(book.yml)가 매 배포마다 재생성. 다운로드 링크는 홈 hero와 상단 nav에 있음

## 목차와 파일 매핑

| 장 | 제목 | 파일 | 상태 |
|---|---|---|---|
| 도입 | 무엇을 만드는가 — Echo Flip의 요구사항 | `doc/intro.md` | 검토 완료 |
| 1부 1장 | 기술 선택 — 왜 이 조합인가 | `doc/part1/tech-choices.md` | 검토 완료 |
| 1부 2장 | Go — 작은 서버를 위한 백엔드 언어 | `doc/part1/go.md` | 검토 완료 |
| 1부 3장 | Gin으로 만드는 HTTP API | `doc/part1/gin.md` | 검토 완료 |
| 1부 4장 | TypeScript — 타입으로 지키는 프런트엔드 | `doc/part1/typescript.md` | 검토 완료 |
| 1부 5장 | React와 Next.js로 만드는 화면 | `doc/part1/react.md` | 검토 완료 |
| 1부 6장 | PostgreSQL 데이터베이스 설계 | `doc/part1/database.md` | 검토 완료 |
| 2부 7장 | Claude Code — AI 에이전트와 개발하기 | `doc/part2/claude-code.md` | 검토 완료 |
| 2부 8장 | 서브에이전트와 훅으로 만드는 품질 게이트 | `doc/part2/agents-hooks.md` | 검토 완료 |
| 2부 9장 | Vercel — 한 플랫폼에 모두 배포하기 | `doc/part2/vercel.md` | 검토 완료 |
| 2부 10장 | Supabase — 인증과 데이터베이스 | `doc/part2/supabase.md` | 검토 완료 |

상태 값: `미착수` → `초안 작성 중` → `초안 완료` → `검토 완료`

### 장별 필수 내용 요약

- **도입**: 앱 소개(영어 암기 카드), 기능 요구사항(양방향 카드·덱·학습 흐름·SRS·스마트 덱·통계·공유·CSV·사전 API·TTS), 비기능 요구사항(무료 인프라, 운영 부담 최소화, PWA), 전체 아키텍처 개요(정적 Next + Vercel Go 함수 + Supabase), 책의 구성과 범위 안내.
- **1장 기술 선택**: 1부 기술들의 선택 이유를 한 장에 모은 장. 공통 선택 기준(무료·관리 최소·AI 협업·서버리스 적합) → 왜 Go(vs Node/Python/JVM) → 왜 Gin(vs net/http·chi·Echo) → 왜 TypeScript(vs JS) → 왜 React·Next.js·정적 export(vs Vue/Svelte) → 왜 관계형 DB·PostgreSQL(vs SQLite/NoSQL). Vercel·Supabase 선택 이유는 9·10장 소관.
- **2장 Go**: 모듈·패키지·`cmd`/`internal`/`pkg` 구조, 구조체·다중 반환·에러 처리, 테이블 주도 테스트(`internal/srs/srs_test.go`), 품질 도구(gofmt, go vet, go build, staticcheck). 예제: `internal/srs/`, `internal/smartrules/`.
- **3장 Gin**: 라우터 조립(`pkg/app/app.go`), 로컬 서버와 Vercel 함수가 같은 앱을 공유하는 구조, 핸들러·JSON 바인딩, 미들웨어(CORS, JWT 인증 `internal/auth/jwt.go`), handlers→store 계층 분리.
- **4장 TypeScript**: 타입 기초(`src/lib/types.ts`), 유니온·제네릭, zod 런타임 검증, 순수 로직 모듈(`csv.ts`, `dictionary.ts`), 품질 도구(tsc strict, vitest).
- **5장 React/Next.js**: 컴포넌트·props(`Flashcard.tsx`), 훅(`useStudySession.ts`, `useTts.ts`), Context(`AuthProvider.tsx`), TanStack Query, App Router와 정적 export(쿼리 파라미터 라우팅 + vercel.json rewrite), PWA 매니페스트(`src/app/manifest.ts`), Tailwind 간단히.
- **6장 DBMS 설계**: 요구사항→테이블 도출, 스키마(`internal/db/migrations/*.sql`), 키·제약·인덱스, 마이그레이션 관리(`cmd/migrate`), SRS 데이터 모델, RLS 전략(정책 0개 enable로 PostgREST 차단, Go API 전용 접근).
- **7장 Claude Code**: 에이전트 동작 원리(도구 호출 루프), CLAUDE.md·권한·세션 개념, 이 프로젝트에서의 개발 흐름(지시→생성→검증), 사람의 역할.
- **8장 서브에이전트와 훅**: 훅 개념과 `settings.json`, `go-check.sh` 해부(gofmt 자동 적용, go vet 실패 시 exit 2 피드백, 성공 시 무음=토큰 0), 서브에이전트 개념(별도 컨텍스트·모델 지정), `go-quality.md` 해부(Vercel 호환 빌드 검사 포함, 요약만 반환), 설계 의도(결정적 검사는 훅, 종합 검증은 서브에이전트).
- **9장 Vercel**: 선택 이유(무료 티어에서 정적+함수 올인원, Koyeb 상주 서버 대안과 비교), 정적 export 배포, Go 서버리스 함수(`api/index.go` catch-all, internal import 불가 제약 → `pkg/app`), `vercel.json` rewrites, 리전 iad1 고정.
- **10장 Supabase**: 선택 이유(무료 Postgres+Auth 통합, Neon·Firebase 대안 비교), OAuth 로그인 흐름과 Go의 JWKS 검증, pgx 연결(트랜잭션 풀러 6543 + simple protocol이 필요한 이유), 리전 콜로케이션.

## 독자 대상 (2026-07-09 지시)

개발자뿐 아니라 **개발자가 아닌 독자도 끝까지 읽을 수 있어야** 한다.
전문용어로만 굴러가는 문장은 일상어로 한 번 풀어 준 뒤 기술적 서술을 잇는다.
코드 블록은 비개발자가 건너뛰더라도 앞뒤 문장만으로 흐름을 따라갈 수 있게, 블록 앞에 "이 코드가 하는 일"을 한두 문장으로 밝힌다.

핵심 용어는 **용어 상자**로 설명한다.

- 문법: VitePress 내장 `::: info` 컨테이너를 쓰고, 제목은 `용어 · 이름(영문)` 형식으로 시작한다.
- 스타일: `.vitepress/theme/custom.css`의 "용어 상자" 절에서 `.custom-block.info`를 사전 항목처럼 꾸민다(본문은 명조, 상자 안은 고딕). 인쇄·PDF에서는 배경 없이 테두리만 남고 쪽을 넘어 갈라지지 않는다.
- 분량: 상자당 2~4문장. 한 줄 정의 + 일상적인 비유나 필요한 이유. 장당 8개를 넘기지 않는다.
- 위치: 그 용어가 본문에 처음 등장하는 문단 바로 다음.
- **용어 소유권**: 한 용어의 상자는 책 전체에서 한 장만 갖는다(아래 배정표). 뒤 장에서는 상자를 반복하지 않고 필요하면 한 구절로만 짚는다.

용어 배정표:

| 파일 | 소유 용어 |
|---|---|
| `intro.md` | API, 프런트엔드와 백엔드, 간격 반복(SRS), 서버리스, 콜드스타트, PWA, 무료 티어, JWT |
| `part1/tech-choices.md` | 컴파일/인터프리터 언어, 런타임, 정적/동적 타입, 프레임워크와 라이브러리, 의존성, 관계형 데이터베이스, 트레이드오프 |
| `part1/go.md` | 모듈과 패키지, 구조체, 다중 반환값과 에러 처리, 순수 함수, 테이블 주도 테스트, 포매터와 정적 분석 |
| `part1/gin.md` | HTTP 요청과 응답, 라우터와 라우팅, 엔드포인트, 핸들러, JSON과 바인딩, 미들웨어, CORS |
| `part1/typescript.md` | 컴파일(트랜스파일), 유니온 타입, 제네릭, 런타임 검증, 테스트 러너 |
| `part1/react.md` | 컴포넌트와 props, 상태와 React 훅, Context, 서버 상태와 캐시, 클라이언트 라우팅, 정적 export, 웹 앱 매니페스트 |
| `part1/database.md` | 테이블·행·열, 기본 키와 외래 키, 제약, 인덱스, 트랜잭션, 마이그레이션, RLS |
| `part2/claude-code.md` | LLM, AI 코딩 에이전트와 도구 호출 루프, 컨텍스트와 토큰, 세션, 프롬프트, 프로젝트 지침(CLAUDE.md) |
| `part2/agents-hooks.md` | 훅(Claude Code), 종료 코드, 서브에이전트, 품질 게이트 |
| `part2/vercel.md` | 빌드와 배포, 리라이트, 캐치올, 리전, CDN |
| `part2/supabase.md` | 관리형 서비스, OAuth, JWKS와 서명 검증, 무상태, 커넥션 풀러, 프리페어드 스테이트먼트, 콜로케이션 |

**훅(Hook)은 동음이의어다.** 5장의 훅은 React의 상태 관리 함수이고, 8장의 훅은 Claude Code가 자동 실행하는 스크립트다.
각 장의 상자에서 서로 다른 것임을 한 문장으로 구분해 준다.

## 문체 가이드 (모든 장 공통)

`~/source/wikibook/springbatch/src/batch-overview.adoc`의 문체를 따른다.

1. 문어체 평서형 **'~다'** 로 끝맺는다. '~입니다'체 금지. 용어 상자 안에서도 '~다'체.
2. 소스 수준에서 **한 문장마다 줄바꿈**한다. 문단 구분은 빈 줄.
3. 장 도입부에서 "이번 장에서는 ~를 살펴보겠다"처럼 다룰 내용을 예고하고, 장 끝에 "정리" 절을 둔다.
4. 기술 선택은 **트레이드오프 관점**으로 서술한다. 대안을 먼저 나열하고, 언제 대안이 더 나은지도 함께 짚는다. 단정 대신 근거를 제시한다.
5. 번호 나열이 길어지면 "첫째, ... 둘째, ..." 문단 스타일을 쓴다.
6. 기술 용어는 처음 등장할 때 한글(영문) 병기. 예: 간격 반복(Spaced Repetition).
7. 코드 예제는 반드시 이 저장소의 실제 코드에서 발췌하고, 코드 블록 앞 본문이나 캡션에 파일 경로를 명시한다. 설명에 불필요한 부분은 `// ...` 로 생략한다.
8. 독자를 가르치려 들기보다 경험을 나누는 어조. "~해 보자", "~를 짚어 보겠다" 같은 표현 활용.
9. 도입 장에는 코드 블록을 싣지 않는다(아키텍처 텍스트 다이어그램은 예외). 코드는 그것을 해설하는 장에 두고, 도입에서는 말로 풀어 설명한 뒤 해당 장을 가리킨다. (2026-07-09 지시)

문체 예시(참고 원문 발췌):

> 겉으로 보이진 않더라도 규모가 큰 시스템에서 배치 모듈은 빠질 수 없는 구성 요소로 중요한 역할을 한다.
> 그럼에도 웹 개발에 비하면 배치 개발에 대한 설계, 구현 기법은 충분히 공유되고 있지 않다고 느껴진다.
> 그 첫걸음으로 우선 배치 작업의 특성과 개발에 미치는 영향을 분석해 보겠다.

## 작업 절차 (세션 재개 시)

1. 이 파일의 진도표에서 `미착수`/`초안 작성 중` 장을 확인한다.
2. 장별 초안은 병렬 서브에이전트로 작성해도 된다(각 에이전트가 서로 다른 파일 담당).
3. 초안 완료 후 `cd doc && npm run build`로 빌드(깨진 링크 포함 검증)를 확인한다.
4. 진도표 상태를 갱신하고 커밋한다.

## 남은 작업 (전체 로드맵)

- [x] VitePress 스켈레톤 (`doc/package.json`, `.vitepress/config.ts`, `index.md`)
- [x] GitHub Actions 워크플로 (`.github/workflows/book.yml`)
- [x] 전체 10개 장 초안 작성 (2026-07-09, 총 약 5,800줄)
- [x] 1부 재구성 (2026-07-09): 각 장에 흩어져 있던 기술 선택 이유를 새 1장(`part1/tech-choices.md`)으로 통합, 이후 장 번호 한 칸씩 밀림(총 11개 장). 상호 참조 정합성 수동 검토 완료.
- [x] 제목 변경 + 무료 티어 보강 (2026-07-09): 새 제목에 맞춰 9장·10장에 "무료 티어로 어디까지 갈 수 있는가" 절 추가(2026년 7월 기준 공식 요금 페이지 수치, 변동 가능성 명시). 수치는 개정 시 재확인 필요.
- [x] 전체 통독 검토 (2026-07-09, 병렬 검토 에이전트 4개): 장 간 중복 제거(1↔5장 정적 export 절 통합→5장, 7↔8장 settings.json 전문→8장, 도입↔2장 SRS 코드→2장, 9↔10장 리전 논증→10장, 3·6·8장 반복 설명 축약), 상호 참조 오류 수정(도입 마무리가 1장 대신 2장 예고, 6장의 존재하지 않는 "2장 embed" 참조, 5장의 vitest를 8장으로 오지정), 사실 불일치 수정(1장 zod 실사용 암시, 기동 시간 자릿수, 9장 실행 시간 제한, 8장의 실재하지 않는 CI·프로젝트 지침 서술), 표기 통일(콜드스타트, npx tsc), 5장 vercel.json 발췌 누락 항목 보완. 코드 주석 오류도 수정(pkg/app/app.go Base62→Base36).
- [x] `npm run build` 통과 확인 후 커밋·push
- [x] GitHub Pages Source = GitHub Actions 설정 (gh api로 완료)
- [x] 배포된 사이트에서 렌더링 확인 (홈·도입 장 200 OK, 2026-07-09)
- [x] 통독 검토 후 진도표 상태를 `검토 완료`로 갱신 (2026-07-09)
- [x] 비개발자 독자 대응 (2026-07-09, 병렬 서브에이전트 11개): 전 장에 용어 상자 70개 삽입(장별 소유 용어만, 중복 없음), 전문용어로만 굴러가던 문장 풀어쓰기, 코드 블록 앞 "이 코드가 하는 일" 문장 보강. `custom.css`에 용어 상자 스타일(화면·인쇄) 추가. 검증: 제목·코드 블록 원문과 바이트 동일, 컨테이너 펜스 짝 일치, 분량 105~115%(상한 130%), `npm run build` 통과, 렌더 결과 `custom-block` 70개 확인.
- [ ] (선택) 이후 세션: 필요 시 부록(로컬 개발 환경·배포 절차) 추가 검토
