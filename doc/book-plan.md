# 책 작업 계획과 진도표 (book-plan.md)

Echo Flip 앱을 소재로 한 기술서를 `doc/` 아래에 VitePress로 집필해 GitHub Pages로 배포한다.
이 파일은 세션이 끊겨도 이어서 작업할 수 있도록 계획·진행 상태·집필 규칙을 기록한다.
사이트 빌드에서는 제외된다(`.vitepress/config.ts`의 `srcExclude`).

## 책 개요

- 제목: **Echo Flip으로 배우는 풀스택 개발**
- 목적: 이 앱의 모든 코드를 해설하는 책이 아니다. 비슷한 앱을 직접 만들 수 있도록 언어·프레임워크·배포 인프라 지식을 이 앱의 실제 코드 예제로 전달한다.
- 각 기술의 **선택 이유(트레이드오프)** 를 반드시 다룬다: 왜 Go인가, 왜 TypeScript·React인가, 왜 Vercel·Supabase인가.
- 배포: GitHub Pages (https://benelog.github.io/echo-flip/), `.github/workflows/book.yml`이 `doc/**` 변경 push 시 자동 배포.
  - Pages Source는 GitHub Actions로 설정 완료(2026-07-09, `gh api repos/benelog/echo-flip/pages -X POST -f build_type=workflow`).

## 기술 구성

- SSG: **VitePress** (선택 이유: 앱과 동일한 npm 스택이라 도구 추가 부담 없음, 마크다운 기반, 한국어 로컬 검색 내장, GitHub Pages 배포 단순)
- 소스 위치: `doc/` (독립 `package.json`, 앱 의존성과 분리)
- 로컬 확인: `cd doc && npm install && npm run dev` / 빌드 검증: `npm run build`

## 목차와 파일 매핑

| 장 | 제목 | 파일 | 상태 |
|---|---|---|---|
| 도입 | 무엇을 만드는가 — Echo Flip의 요구사항 | `doc/intro.md` | 초안 완료 |
| 1부 1장 | Go — 작은 서버를 위한 백엔드 언어 | `doc/part1/go.md` | 초안 완료 |
| 1부 2장 | Gin으로 만드는 HTTP API | `doc/part1/gin.md` | 초안 완료 |
| 1부 3장 | TypeScript — 타입으로 지키는 프런트엔드 | `doc/part1/typescript.md` | 초안 완료 |
| 1부 4장 | React와 Next.js로 만드는 화면 | `doc/part1/react.md` | 초안 완료 |
| 1부 5장 | PostgreSQL 데이터베이스 설계 | `doc/part1/database.md` | 초안 완료 |
| 2부 6장 | Claude Code — AI 에이전트와 개발하기 | `doc/part2/claude-code.md` | 초안 완료 |
| 2부 7장 | 서브에이전트와 훅으로 만드는 품질 게이트 | `doc/part2/agents-hooks.md` | 초안 완료 |
| 2부 8장 | Vercel — 한 플랫폼에 모두 배포하기 | `doc/part2/vercel.md` | 초안 완료 |
| 2부 9장 | Supabase — 인증과 데이터베이스 | `doc/part2/supabase.md` | 초안 완료 |

상태 값: `미착수` → `초안 작성 중` → `초안 완료` → `검토 완료`

### 장별 필수 내용 요약

- **도입**: 앱 소개(영어 암기 카드), 기능 요구사항(양방향 카드·덱·학습 흐름·SRS·스마트 덱·통계·공유·CSV·사전 API·TTS), 비기능 요구사항(무료 인프라, 운영 부담 최소화, PWA), 전체 아키텍처 개요(정적 Next + Vercel Go 함수 + Supabase), 책의 구성과 범위 안내.
- **1장 Go**: 선택 이유(서버리스 콜드스타트·단일 바이너리·적은 메모리 vs Node/JVM 대안), 모듈·패키지·`cmd`/`internal`/`pkg` 구조, 구조체·다중 반환·에러 처리, 테이블 주도 테스트(`internal/srs/srs_test.go`), 품질 도구(gofmt, go vet, go build, staticcheck). 예제: `internal/srs/`, `internal/smartrules/`.
- **2장 Gin**: 선택 이유(표준 `net/http`·chi·Echo와 비교), 라우터 조립(`pkg/app/app.go`), 로컬 서버와 Vercel 함수가 같은 앱을 공유하는 구조, 핸들러·JSON 바인딩, 미들웨어(CORS, JWT 인증 `internal/auth/jwt.go`), handlers→store 계층 분리.
- **3장 TypeScript**: 선택 이유(JS의 한계, 타입이 주는 검증 신호), 타입 기초(`src/lib/types.ts`), 유니온·제네릭, zod 런타임 검증, 순수 로직 모듈(`csv.ts`, `dictionary.ts`), 품질 도구(tsc strict, vitest).
- **4장 React/Next.js**: 선택 이유(생태계, 컴포넌트 모델, Next 정적 export), 컴포넌트·props(`Flashcard.tsx`), 훅(`useStudySession.ts`, `useTts.ts`), Context(`AuthProvider.tsx`), TanStack Query, App Router와 정적 export(쿼리 파라미터 라우팅 + vercel.json rewrite), Tailwind 간단히.
- **5장 DBMS 설계**: 요구사항→테이블 도출, 스키마(`internal/db/migrations/*.sql`), 키·제약·인덱스, 마이그레이션 관리(`cmd/migrate`), SRS 데이터 모델, RLS 전략(정책 0개 enable로 PostgREST 차단, Go API 전용 접근).
- **6장 Claude Code**: 에이전트 동작 원리(도구 호출 루프), CLAUDE.md·권한·세션 개념, 이 프로젝트에서의 개발 흐름(지시→생성→검증), 사람의 역할.
- **7장 서브에이전트와 훅**: 훅 개념과 `settings.json`, `go-check.sh` 해부(gofmt 자동 적용, go vet 실패 시 exit 2 피드백, 성공 시 무음=토큰 0), 서브에이전트 개념(별도 컨텍스트·모델 지정), `go-quality.md` 해부(Vercel 호환 빌드 검사 포함, 요약만 반환), 설계 의도(결정적 검사는 훅, 종합 검증은 서브에이전트).
- **8장 Vercel**: 선택 이유(무료 티어에서 정적+함수 올인원, Koyeb 상주 서버 대안과 비교), 정적 export 배포, Go 서버리스 함수(`api/index.go` catch-all, internal import 불가 제약 → `pkg/app`), `vercel.json` rewrites, 리전 iad1 고정.
- **9장 Supabase**: 선택 이유(무료 Postgres+Auth 통합, Neon·Firebase 대안 비교), OAuth 로그인 흐름과 Go의 JWKS 검증, pgx 연결(트랜잭션 풀러 6543 + simple protocol이 필요한 이유), 리전 콜로케이션.

## 문체 가이드 (모든 장 공통)

`~/source/wikibook/springbatch/src/batch-overview.adoc`의 문체를 따른다.

1. 문어체 평서형 **'~다'** 로 끝맺는다. '~입니다'체 금지.
2. 소스 수준에서 **한 문장마다 줄바꿈**한다. 문단 구분은 빈 줄.
3. 장 도입부에서 "이번 장에서는 ~를 살펴보겠다"처럼 다룰 내용을 예고하고, 장 끝에 "정리" 절을 둔다.
4. 기술 선택은 **트레이드오프 관점**으로 서술한다. 대안을 먼저 나열하고, 언제 대안이 더 나은지도 함께 짚는다. 단정 대신 근거를 제시한다.
5. 번호 나열이 길어지면 "첫째, ... 둘째, ..." 문단 스타일을 쓴다.
6. 기술 용어는 처음 등장할 때 한글(영문) 병기. 예: 간격 반복(Spaced Repetition).
7. 코드 예제는 반드시 이 저장소의 실제 코드에서 발췌하고, 코드 블록 앞 본문이나 캡션에 파일 경로를 명시한다. 설명에 불필요한 부분은 `// ...` 로 생략한다.
8. 독자를 가르치려 들기보다 경험을 나누는 어조. "~해 보자", "~를 짚어 보겠다" 같은 표현 활용.

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
- [ ] 전체 통독 검토: 장 간 중복 제거, 상호 참조("N장에서 다룬다") 정합성 확인
- [x] `npm run build` 통과 확인 후 커밋·push
- [x] GitHub Pages Source = GitHub Actions 설정 (gh api로 완료)
- [x] 배포된 사이트에서 렌더링 확인 (홈·도입 장 200 OK, 2026-07-09)
- [ ] (선택) 이후 세션: 통독 검토 후 상태를 `검토 완료`로 갱신, 필요 시 부록(로컬 개발 환경·배포 절차) 추가 검토
