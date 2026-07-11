# 책 작업 계획과 진도표 (book-plan.md)

Echo Flip 앱을 소재로 한 기술서를 `doc/` 아래에 VitePress로 집필해 GitHub Pages로 배포한다.
이 파일은 세션이 끊겨도 이어서 작업할 수 있도록 계획·진행 상태·집필 규칙을 기록한다.
사이트 빌드에서는 제외된다(`.vitepress/config.ts`의 `srcExclude`).

## 책 개요

- 제목: **월 0원으로 운영하는 나만의 웹 앱** — 부제: AI에게 지시해 Go로 만들고, 무료 한도 안에서 운영한다
  - 2026-07-11 변경. 차별점(AI 에이전트·Go·무료 한도)이 부제에 드러나게 다듬었다. '서버 앱' 안은 산출물이 화면·PWA까지 갖춘 웹 앱이라는 이유로 기각.
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

부 제목: 1부 **내 컴퓨터에서 웹 앱 완성하기** (1~13장, SQLite 로컬 모드로 내 컴퓨터에서 완결) / 2부 **세상에 공개하고 오래 운영하기** (14~21장, 버전 관리와 개발·운영 환경 분리 위에서 배포·운영). 도입은 기능 요구사항만 다루고, 비기능 요구사항·아키텍처는 1장으로 통합했다. (2026-07-11 AI 비중 확대 개편: Claude Code를 2장으로 전진 배치, 3장 '에이전트에게 지시하기' 신설, 옛 12장 훅·서브에이전트를 8장으로 통합, 기술 장마다 '에이전트 활용 아이디어' 절 추가)

| 장 | 제목 | 파일 | 상태 |
|---|---|---|---|
| 도입 | 무엇을 만드는가: Echo Flip의 기능 요구사항 | `doc/intro.md` | 초안 완료 |
| 1부 1장 | 기술 선택: 요구사항에서 아키텍처까지 | `doc/part1/tech-choices.md` | 초안 완료 |
| 1부 2장 | Claude Code: AI 에이전트와 개발하기 | `doc/part1/claude-code.md` | 초안 완료 |
| 1부 3장 | 에이전트에게 지시하기: Plan 모드 활용 | `doc/part1/instructing.md` | 초안 완료 |
| 1부 4장 | 데이터베이스 기초: 테이블, SQL, 인덱스 | `doc/part1/database-basics.md` | 검토 완료 |
| 1부 5장 | 데이터베이스 설계: 요구사항에서 테이블로 | `doc/part1/database.md` | 검토 완료 |
| 1부 6장 | Go 기초: 모듈, 변수, 함수 | `doc/part1/go-basics.md` | 검토 완료 |
| 1부 7장 | Go 코드 읽기: 구조체, 포인터, 에러 처리 | `doc/part1/go.md` | 초안 완료 |
| 1부 8장 | Go 테스트와 품질 게이트: 도구, 훅, 서브에이전트 | `doc/part1/go-testing.md` | 초안 완료 |
| 1부 9장 | Gin으로 만드는 HTTP API | `doc/part1/gin.md` | 초안 완료 |
| 1부 10장 | HTML과 CSS: 화면을 이루는 문서와 스타일 | `doc/part1/html-css.md` | 초안 완료 |
| 1부 11장 | html/template으로 만드는 화면 | `doc/part1/go-templates.md` | 초안 완료 |
| 1부 12장 | htmx: 자바스크립트 없이 만드는 동적 화면 | `doc/part1/htmx.md` | 초안 완료 |
| 1부 13장 | 로컬 개발 환경: 내 컴퓨터에서 앱 완성하기 | `doc/part1/local-dev.md` | 초안 완료 |
| 2부 14장 | Git: 개념과 브랜치 정책 | `doc/part2/git.md` | 검토 완료 |
| 2부 15장 | GitHub Actions: 원격 품질 게이트 | `doc/part2/github-actions.md` | 초안 완료 |
| 2부 16장 | Vercel: 한 플랫폼에 모두 배포하기 | `doc/part2/vercel.md` | 초안 완료 |
| 2부 17장 | Supabase 인증: OAuth와 JWKS 검증 | `doc/part2/supabase-auth.md` | 초안 완료 |
| 2부 18장 | Supabase 데이터베이스: pgx 연결과 개발·운영 DB 분리 | `doc/part2/supabase-db.md` | 초안 완료 |
| 2부 19장 | PWA: 설치되는 앱으로 만들기 | `doc/part2/pwa.md` | 초안 완료 |
| 2부 20장 | 무료 티어 운영과 한도 관리 | `doc/part2/free-tier.md` | 초안 완료 |
| 2부 21장 | 다음 단계: 여기서 더 공부할 것들 | `doc/part2/whats-next.md` | 초안 완료 |
| 부록 A | 개발 도구 설치 | `doc/appendix/setup.md` | 초안 완료 |

상태 값: `미착수` → `초안 작성 중` → `초안 완료` → `검토 완료`
2026-07-11 Go SSR 전환 재편(아래 로드맵 참조)에서 신설·재작성·수정된 장은 전부 `초안 완료`로 두었다. 통독 검토를 통과하면 `검토 완료`로 승격한다. 이번 재편에서 안 바뀐 장: 2·3·5·6·14장(재번호만).

### 장별 필수 내용 요약

- **도입**: 앱 소개(암기 카드), 기능 요구사항(양방향 카드·덱·학습 흐름·SRS·스마트 덱·통계·공유·CSV·사전 API·TTS), 비기능 요구사항(무료 인프라, 운영 부담 최소화, PWA), 전체 아키텍처 개요(Vercel의 Go 함수 하나가 HTML 렌더링·정적 자산·JSON API를 모두 서빙 + Supabase, 이 그림은 2부에서 완성되는 운영 모드이고 1부에서는 같은 코드가 SQLite 로컬 모드로 돈다는 두 모드 관점), 책의 구성(1부 로컬 완성 / 2부 공개·운영, 준비물은 Go뿐이고 Supabase·Vercel 계정은 2부부터).
- **1장 기술 선택** (도입 섹션 소속): 각 기술의 선택 이유를 한 장에 모은 장. 공통 선택 기준(무료·관리 최소·AI 협업·서버리스 적합) → 왜 관계형 DB인가: SQLite로 시작해 PostgreSQL로 옮긴다(SQLite=1부 로컬 모드의 선택, 서버리스 복제·휘발 탓에 운영은 PostgreSQL, 스토어 인터페이스 덕에 교체는 배포 대상 선택, vs 문서형 NoSQL) → 왜 Go(vs Node/Python/JVM) → 왜 Gin(vs net/http·chi·Echo) → 왜 서버 렌더링과 htmx인가(vs React·Vue 같은 SPA+TypeScript 생태계, 언제 SPA가 나은지 정직하게, 남는 JS는 app.js 하나). Vercel·Supabase 선택 이유는 16·17장 소관.
- **2장 데이터베이스 기초**: 테이블·행·열과 표 나누기(정규화), 기본 키·외래 키, SQL 선언형 언어와 DDL/DML 구분, sqlite3로 직접 실습(준비물은 sqlite3 하나, 13장의 echo-flip.db 예고), DDL(create/alter, SQLite의 자료형 현실과 check·앱 규약, 제약), DML(insert 자리표시자 `?`와 SQL 인젝션, `$1`은 드라이버 차이, select·집계·조인, update/delete와 where·RowsAffected), 인덱스(B-tree, 복합 인덱스 열 순서, 쓰기 비용). 예제: `internal/litestore/schema.sql`, `internal/litestore/decks.go`, `internal/litestore/cards.go`.
- **3장 데이터베이스 설계**: 요구사항→테이블 도출(사용자·덱·카드, 카드/SRS 분리, 세션·리뷰 로그, 스마트 덱·통계 뷰), 스키마 원전은 `internal/litestore/schema.sql`(서버 시작 시 통째 멱등 적용), 전용 자료형이 적은 SQLite에 설계 의도를 담는 법(uuid는 Go 생성+text, 고정 폭 UTC 텍스트는 문자열 비교=시간 순서, JSON text, text+check, seq는 max+1), 외래 키 프래그마 함정, SRS 데이터 모델(단일 작성자라 잠금 불필요 vs 운영 for update 대비), 덱 slug 설계. 마이그레이션·RLS는 18장으로 이관(다리 문단만).
- **4장 Go 기초**: 모듈·패키지·`cmd`/`internal`/`pkg` 구조(go.mod 직접 의존성 여덟 개, api/index.go의 pkg/app 제약, litestore 포함 트리), 변수와 기본 타입(var/:=, 제로값), 함수와 다중 반환값, 공개 규칙(대소문자), 제어문(if 초기화문, for range, switch), 상수. 예제: `internal/config/config.go`(DATABASE_URL 유무로 두 모드 분기 + SUPABASE_URL·ANON_KEY 검증 + Vercel 가드), `cmd/server/main.go`(드라이버 분기), `internal/store/deckslug.go`.
- **5장 Go 코드 읽기**: `internal/srs` 중심으로 구조체·제로값 설계·다중 반환·time 패키지, 포인터 기초(&·*·nil)와 리시버, 에러 처리(error 값, %w 래핑, errors.Is, 센티널), 슬라이스(append, make 용량)와 맵(comma-ok), 문자열 처리(strings), JSON 직렬화(Marshal/Unmarshal). 예제: `internal/srs/`, `internal/smartrules/`, `internal/store/`.
- **6장 Go 테스트와 품질 도구**: go test 규칙(_test.go, Test 접두사, *testing.T)과 실행 명령(-run, -v), 테이블 주도 테스트(`internal/srs/srs_test.go`, `internal/smartrules/rules_test.go`), 전수 검사와 경계값(`internal/store/deckslug_test.go`), t.Fatalf vs t.Errorf, 화이트박스 테스트, 품질 도구(gofmt, go vet, go build, staticcheck), gofmt의 세로 정렬(선언부 강제·문장은 해제, diff 확대라는 대가, 빈 줄로 그룹 분리, 룬 기준 폭 계산과 한글 어긋남, 메모리 정렬과의 용어 구분), 테스트=AI 검증 신호.
- **7장 Gin**: 라우터 조립(`pkg/app/app.go`의 New/Engine 분리: New는 순수 조립 + 끝에서 web.New 등록, Engine은 Vercel용 싱글턴+postgres 가드), 로컬 서버와 Vercel 함수가 같은 New 위에서 도는 구조, 핸들러·JSON 바인딩, 미들웨어(CORS는 별도 오리진 클라이언트용 옵션, JWT 인증 `internal/auth/jwt.go`와 로컬 모드의 LocalMiddleware 교체), handlers→store 계층 분리(`Store` 인터페이스를 pgx·litestore 이중 구현이 만족), JSON API는 프로그램용으로 남고 화면은 8~10장의 HTML이 담당.
- **8장 HTML과 CSS** (2026-07-11 신설): HTML 문서 뼈대(doctype·head·body, layout.html), 시맨틱 태그, 폼(input·textarea·라디오 알약·파일 업로드·details/summary), CSS 선택자·캐스케이드·변수 토큰, 박스 모델, 플렉스박스·그리드 배치, prefers-color-scheme 다크 모드, 하이라이트: 자바스크립트 없는 카드 뒤집기(체크박스 + :checked ~ 형제 선택자 + 3D 변환). 예제: `internal/web/templates/`, `internal/web/static/app.css`.
- **9장 html/template** (2026-07-11 신설): 문자열 조립의 위험 → 템플릿 엔진, 액션 문법(점·if/range/with·$), 레이아웃/페이지/partial과 base Clone 패턴(`internal/web/web.go` parseTemplates·render), FuncMap(icon·pct·koDate), 컨텍스트 자동 이스케이프와 XSS(URL 문맥 이스케이프에 맡긴 ruleRaw 사례), //go:embed로 자산을 바이너리에, view 구조체와 폼 처리(PostForm)·PRG 패턴·플래시 쿠키, 템플릿 테스트(templates_test.go).
- **10장 htmx** (2026-07-11 신설): 전체 새로고침의 한계 → HTML 속성으로 선언하는 부분 갱신, hx-post/hx-target/hx-swap/hx-confirm, HX-Request 분기와 조각 응답(renderPartial), 중심 절: 무상태 학습 화면(카드 큐·라운드·점수를 hidden 필드로 왕복, 서버리스 논증, `internal/web/study.go`), hx-swap-oob(사전 채우기), HX-Redirect, "그래도 남는 자바스크립트" app.js 해부(TTS·클립보드·오프라인·서비스 워커 등록·tz 쿠키, data-* 이벤트 위임).
- **11장 Claude Code**: 에이전트 동작 원리(도구 호출 루프), CLAUDE.md·권한·세션 개념, 이 프로젝트에서의 개발 흐름(지시→생성→검증), 사람의 역할.
- **12장 서브에이전트와 훅**: 훅 개념과 `settings.json`, `go-check.sh` 해부(gofmt 자동 적용, go vet 실패 시 exit 2 피드백, 성공 시 무음=토큰 0), 서브에이전트 개념(별도 컨텍스트·모델 지정), `go-quality.md` 해부(Vercel 호환 빌드 검사 포함, 요약만 반환), 설계 의도(결정적 검사는 훅, 종합 검증은 서브에이전트).
- **13장 로컬 개발 환경** (1부 피날레): 준비물은 Go뿐, 명령 하나(`go run ./cmd/server`, :8080)로 로그인 없이 앱 완성, 무설정 실행의 동작 원리(config.go 분기, LocalMiddleware, 로컬 모드에선 로그인 화면 자체가 안 뜸), 내 데이터는 파일 하나(litestore.Open의 스키마 자동 적용, sqlite3 실습, 백업=파일 복사), `.vscode/` 네 파일 해부(extensions/settings/tasks/launch, launch.json은 환경 변수 없이 F5), 사람의 입구와 에이전트의 입구, 환경 변수라는 손잡이(SQLITE_PATH·PORT, 운영 연결·direnv는 18장), 1부 마무리와 2부 예고.
- **14장 Git** (2부 개막): 개념 위주(명령어는 11장의 에이전트가 실행하니 외울 필요 없고, 사람은 diff·이력을 읽고 판단), 버전 관리가 필요한 이유, 핵심 개념(커밋·브랜치·병합·PR·원격), 실제 git log 발췌, 브랜치 정책 트레이드오프 비교, Echo Flip의 선택=GitLab flow 단순화: main(개발)·release(운영), 브랜치↔환경 대응(16·18장 예고), 정책의 대가.
- **15장 GitHub Actions**: 로컬 게이트(훅·태스크)가 새는 세 곳, 14장 브랜치 정책 위에 얹는 원격 게이트, Actions 구조, `.github/workflows/ci.yml` 해부(on push branches [main, release], concurrency, setup-go, `gofmt -l`로 고발하기, api/→internal/ import 금지 grep; web 잡은 2026-07-11 전환으로 삭제되어 Go 잡 하나), 세 게이트가 같은 명령을 쓴다는 원칙과 대응표, Vercel 자동 배포와 CI의 차이, staticcheck·E2E를 뺀 이유, 20장의 스케줄 워크플로 예고.
- **16장 Vercel**: 선택 이유(무료 티어 올인원, Koyeb 상주 서버 대안과 비교), Go 서버리스 함수 하나가 전부 서빙(`api/index.go` catch-all, internal import 불가 제약 → `pkg/app`, 정적 자산은 embed + Cache-Control), `vercel.json`의 전체 경로 rewrite, Framework Preset=Other, 개발 배포와 운영 배포를 가른다(Production/Preview, Production Branch=release, 환경 변수 스코프, 상세 배선은 18장), 리전 iad1 고정. 무료 티어 한도 절은 20장 소관.
- **17장 Supabase 인증** (2026-07-11 서버 사이드로 재작성): 로컬 인증에서 운영 인증으로(가드 유지), 선택 이유(대안 비교), 절제(PostgREST·Realtime·Storage에 더해 supabase-js도 미사용), 서버 사이드 OAuth: 리다이렉트 여행(`internal/web/authpages.go`), PKCE(`gotrue.go`), HttpOnly 쿠키 세션(`session.go`, HttpOnly·Secure·SameSite=Lax가 각각 막는 것, localStorage 방식과 비교), 자동 리프레시·requireUser·safeNext(열린 리다이렉트 방지), 로그아웃, 페이지=쿠키/API=Bearer 이중 경로(auth.SetUserID로 컨텍스트 공유), JWKS 검증(ParseUser 포함), 환경 변수(SUPABASE_URL·SUPABASE_ANON_KEY).
- **18장 Supabase 데이터베이스**: SQLite에서 PostgreSQL로(DATABASE_URL이 모드를 가른다), 같은 설계 더 풍부한 타입, pgx와 서버리스 커넥션 폭증, 트랜잭션 풀러(6543)와 simple protocol, 마이그레이션, 리전 콜로케이션, RLS 전략(정책 0개, 17장 접점), 개발 DB와 운영 DB 분리(3층 구조, 브랜치·배포 스코프 배선, 무료 활성 프로젝트 2개 한도), 환경 변수 구성(값이 두 벌, anon key가 비밀이 아닌 이유, direnv와 .envrc). 마이그레이션·RLS·환경 변수 용어 상자를 이 장이 소유.
- **19장 PWA**: 설치 조건 3가지(HTTPS·매니페스트·서비스 워커), 정적 `internal/web/static/manifest.webmanifest`(display standalone, start_url 등), 아이콘 3개와 maskable, `sw.js`(v2) 해부: 페이지 HTML은 서버 렌더링이라 network-first(오프라인일 때만 캐시), 정적 자산은 stale-while-revalidate, `/api/`·비GET·외부 오리진은 network only, skipWaiting+clients.claim, `CACHE = "echo-flip-v2"` 수동 손잡이와 Workbox를 안 쓴 이유, 등록은 app.js(10장), 포기한 것(오프라인 학습·푸시·백그라운드 동기화), DevTools Application 탭 확인.
- **20장 무료 티어 운영**: 무료 티어는 "한도 안에서 살겠다"는 계약. Vercel Hobby 한도·초과 시 차단·비상업 약관, Supabase Free 한도(활성 프로젝트 2개), Echo Flip 규모 대입 → 가장 먼저 터지는 것은 **미사용 프로젝트 일시정지**, 핑 워크플로, pg_dump 백업(90일 복원 기한), 무료의 대가, 유료 전환 신호 3가지, 운영자 체크리스트, 수치는 2026년 7월 기준.
- **21장 다음 단계**: 책이 일부러 비워 둔 자리를 "왜 지금은 없어도 됐는지 / 언제 필요해지는지"의 짝으로 정리. 세 질문(지금 아픈가·되돌릴 수 있나·나중이 더 어려운가), E2E, 관측성, 보안(비밀 회전, gitleaks, Dependabot), 성능·한도, 심화(Go 동시성·인터페이스와 mock, HTML/CSS/JS 심화와 "화면 요구가 복잡해지면 React 같은 SPA로 가는 시점", 접근성, 트랜잭션 격리), 에이전트 심화(MCP, 평가), 이전 경로(`pkg/app`·Store 인터페이스 덕에 이전 비용 낮음), 책 전체 마무리.

## 독자 대상 (2026-07-09 지시)

개발자뿐 아니라 **개발자가 아닌 독자도 끝까지 읽을 수 있어야** 한다.
전문용어로만 굴러가는 문장은 일상어로 한 번 풀어 준 뒤 기술적 서술을 잇는다.
코드 블록은 비개발자가 건너뛰더라도 앞뒤 문장만으로 흐름을 따라갈 수 있게, 블록 앞에 "이 코드가 하는 일"을 한두 문장으로 밝힌다.

핵심 용어는 **용어 상자**로 설명한다.

- 문법: VitePress 내장 `::: info` 컨테이너를 쓰고, 제목은 `[용어 풀이] 이름(영문)` 형식으로 시작한다.
- 스타일: `.vitepress/theme/custom.css`의 "용어 상자" 절에서 `.custom-block.info`를 사전 항목처럼 꾸민다(본문은 명조, 상자 안은 고딕). 인쇄·PDF에서는 배경 없이 테두리만 남고 쪽을 넘어 갈라지지 않는다.
- 분량: 상자당 2~4문장. 한 줄 정의 + 일상적인 비유나 필요한 이유. 장당 8개를 넘기지 않는다.
- 위치: 그 용어가 본문에 처음 등장하는 문단 바로 다음.
- **용어 소유권**: 한 용어의 상자는 책 전체에서 한 장만 갖는다(아래 배정표). 뒤 장에서는 상자를 반복하지 않고 필요하면 한 구절로만 짚는다.

용어 배정표:

| 파일 | 소유 용어 |
|---|---|
| `intro.md` | API, 프런트엔드와 백엔드, 간격 반복(SRS), 서버리스, 콜드스타트, PWA, 무료 티어, OAuth, JWT, 아키텍처, 호스팅, PostgreSQL (도입 장은 예외적으로 11개, 의도적 추가 이력) |
| `part1/tech-choices.md` | 컴파일/인터프리터 언어, 런타임, 정적/동적 타입, 프레임워크와 라이브러리, 의존성, 관계형 데이터베이스, 트레이드오프 |
| `part1/database-basics.md` | 테이블·행·열, 기본 키와 외래 키, SQL, 제약, 조인, 인덱스 |
| `part1/database.md` | 트랜잭션 |
| `part1/go-basics.md` | 모듈과 패키지, 다중 반환값과 에러 처리 |
| `part1/go.md` | 구조체, 순수 함수, 포인터 |
| `part1/go-testing.md` | 테이블 주도 테스트, 포매터와 정적 분석, 세로 정렬 |
| `part1/gin.md` | HTTP 요청과 응답, 라우터와 라우팅, 엔드포인트, 핸들러, JSON과 바인딩, 미들웨어, CORS |
| `part1/html-css.md` | HTML 태그와 요소, 시맨틱 마크업, CSS 선택자, 박스 모델, 플렉스박스와 그리드, CSS 변수(커스텀 프로퍼티), 미디어 쿼리 |
| `part1/go-templates.md` | 템플릿 엔진, 이스케이프와 XSS, embed(Go) |
| `part1/htmx.md` | AJAX(비동기 요청), DOM(문서 객체 모델), 이벤트 위임, Web API(브라우저) |
| `part1/claude-code.md` | LLM, AI 코딩 에이전트와 도구 호출 루프, 컨텍스트와 토큰, 세션, 프롬프트, 프로젝트 지침(CLAUDE.md) |
| `part1/agents-hooks.md` | 훅(Claude Code), 종료 코드, 서브에이전트, 품질 게이트 |
| `part1/local-dev.md` | 언어 서버(Language Server) |
| `part2/git.md` | 버전 관리, 커밋, 브랜치, 병합과 풀 리퀘스트, 기본 브랜치 |
| `part2/github-actions.md` | 지속적 통합(CI, Continuous Integration) |
| `part2/pwa.md` | 서비스 워커(Service Worker), 웹 앱 매니페스트(구 react-next에서 이관) |
| `part2/free-tier.md` | 한도(Quota)와 스로틀링(Throttling) |
| `part2/vercel.md` | 빌드와 배포, 리라이트, 캐치올, 리전, CDN, 프리뷰 배포 |
| `part2/supabase-auth.md` | 관리형 서비스, JWKS와 서명 검증, 무상태, 쿠키(Cookie), PKCE |
| `part2/supabase-db.md` | 커넥션 풀러, 프리페어드 스테이트먼트, 콜로케이션, 마이그레이션(3장에서 이관), RLS(3장에서 이관), 환경 변수(13장에서 이관) |
| `appendix/setup.md` | 터미널, 패키지 매니저 |

**훅(Hook)은 동음이의어다.** 12장의 훅은 Claude Code가 자동 실행하는 스크립트이고, React 같은 프런트엔드 프레임워크의 훅(상태 관리 함수)과는 다른 것이다.
12장의 상자에서 이 구분을 한 문장으로 짚는다. "세션"도 동음이의어다: 11장의 세션은 Claude Code의 대화 단위, 17장의 로그인 세션은 인증 상태다(17장 쿠키 상자에서 구분).

## 화면 캡처 (2026-07-09 지시)

책 초반부의 요구사항과 UI 설명에는 실제 앱 화면을 싣는다.
이미지는 `doc/public/screenshots/` 아래에 두고 `/screenshots/이름.png`로 참조한다(VitePress가 base를 붙여 준다).

- 배치: `<div class="ef-shots">` + 마크다운 이미지 + `<p class="ef-caption">그림 N …</p>`. 휴대폰 화면 한 장짜리는 `ef-shots single`.
- **여러 화면은 반드시 한 장으로 합성해 둔다.** 이 책은 다단 페이지 넘김 모드라 이미지를 flex로 나란히 놓으면 단 경계에서 잘린다.
- 캡처 조건: 배포본(`https://echo-flip-delta.vercel.app`)을 puppeteer로 열어 430×860 뷰포트, 3배 배율로 찍는다. 헤더의 계정 이메일은 `you@example.com`으로 치환한다.
- 캡처용 데모 덱은 "TOEIC 필수 단어"(카드 8장). 개인 학습 데이터가 책에 노출되지 않게 하기 위함이다.
- 현재 실린 그림: 그림 1 덱 상세(intro), 그림 2 학습 3단계(intro), 그림 3 홈·복습 큐(intro), 그림 4 통계·공유(intro), 그림 5 카드 앞뒤(10장 react.md).

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
- [x] 실제 화면 캡처 삽입 (2026-07-09): 배포본에서 데모 덱으로 캡처해 도입 장에 그림 1~4, React 장에 그림 5를 넣었다. `custom.css`에 `.ef-shots`·`.ef-caption` 스타일(화면·인쇄). 검증: `npm run build` 통과, 다단 모드에서 이미지 4장 모두 온전히 렌더(폭 758px 이내), `npm run pdf`로 PDF에 이미지 5개 포함 확인.
- [x] Go·TypeScript 기초 보강 + 13장 개편 (2026-07-10 지시): benelog/jira-navigator의 `study/` 학습 자료(CH02~CH07)의 주제 구성을 참고하되, 코드 예제는 이 저장소의 실제 코드로 다시 씀. Go 장을 2장(기초: 모듈·변수·함수·제어문·상수, `go-basics.md` 신규)·3장(구조체·포인터·에러·컬렉션·문자열·JSON, 기존 `go.md` 개편)·4장(테스트·품질 도구, `go-testing.md` 신규)으로, TypeScript 장을 6장(타입 시스템, 기존 `typescript.md` 개편)·7장(비동기·런타임 검증·품질 도구, `typescript-async.md` 신규)으로 분리. 전체 10장 → 13장 재번호(상호 참조·사이드바·PDF 차례 갱신). 용어 상자 재배치 + 신규 2개(포인터→3장, Promise→7장).
- [x] 비개발자 풀어쓰기 2차 패스 (2026-07-10 지시): 전 장에서 전문용어 연쇄 문장을 일상어로 한 번 풀고, 코드 블록 앞 예고 문장을 보강. 분량 상한 115%.
- [x] React·데이터베이스 기초 보강 + 15장 개편 (2026-07-10 지시): React 장을 8장(기초: DOM·컴포넌트·목록 렌더링·이벤트·훅, 기존 `react.md` 개편)·9장(Context·TanStack Query·App Router·정적 export, `react-next.md` 신규)으로, 데이터베이스 장을 10장(RDB 개념·DDL·DML·인덱스, `database-basics.md` 신규)·11장(스키마 설계, 기존 `database.md`는 기초 상자 4개를 10장으로 이관)으로 분리. 전체 13장 → 15장 재번호(상호 참조·사이드바·PDF 차례 갱신). 용어 상자 재배치 + 신규 3개(DOM→8장, SQL·조인→10장).
- [x] 4장에 gofmt 세로 정렬 절 추가 (2026-07-10 지시): "Go에서 세로 정렬은 관례상 괜찮은가, 논쟁은 없는가"라는 질문을 go1.26.4 gofmt로 직접 실험해 확인한 내용을 `part1/go-testing.md`에 새 절(세로 정렬은 취향이 아니라 규칙이다)로 반영. 선언부는 강제 정렬·문장의 수동 정렬은 제거, diff 확대라는 대가와 `git blame` 영향, 빈 줄의 정렬 그룹 분리, 긴 항목이 있으면 정렬 포기, 룬 개수 기준 폭 계산 탓에 한글 키가 어긋나 보이는 현상, `fieldalignment`(메모리 정렬)와의 용어 구분. 기존 문장 "diff에는 의미 있는 변경만 남는다"는 정렬 노이즈와 어긋나 삭제. 1장의 "`gofmt`가 포맷 논쟁을 원천 차단한다"도 4장 결론과 톤을 맞춰 "고를 것이 없어 논쟁거리에서 빠진다, 대가는 4장에서 짚는다"로 수정. 검증: 원고의 gofmt 출력 코드 블록 4개가 모두 gofmt 고정점임을 확인, `fieldalignment`가 `go vet` 기본 분석기 목록에 없음을 `go tool vet help`로 확인, `npm run build` 통과.
- [x] 설명 순서 DB→Go→TS로 개편 + VS Code 장 신설 (2026-07-10 지시): 데이터 구조를 먼저 알고 사용자에 가까운 레이어로 올라가는 순서가 이해에 낫다는 판단. 1부를 1장 기술 선택, 2·3장 데이터베이스, 4~6장 Go, 7장 Gin, 8·9장 TypeScript, 10·11장 React로 재배치(파일명은 유지, 번호만 이동). 2부에 13장 VS Code(`part2/vscode.md` 신규)를 Claude Code 다음에 삽입해 기존 13~15장을 14~16장으로 밀어냄. 전체 15장 → 16장. 상호 참조 246곳을 단일 패스 매핑으로 재번호(`2~5장`·`6·7장` 같은 범위·병렬 표기 포함). 1장의 절 순서도 `왜 PostgreSQL인가`를 맨 앞으로 옮기고 정리 표의 행 순서를 맞춤. 순서가 바뀌며 방향이 뒤집힌 문장(database-basics의 "5장에서 본 store 계층" 등)은 "볼"로 고치고, 장 이음매(database.md·react-next.md·claude-code.md 마무리, go-basics.md 도입, intro.md 로드맵)를 다시 씀. VS Code 장의 근거로 저장소에 `.vscode/{extensions,settings,tasks,launch}.json`을 실제로 추가.
  - 주의해서 피한 오탐: `database-basics.md`의 `"12장"`은 카드 12장을 뜻하는 표시 문자열이라 장 번호가 아니다(12→12 매핑이라 결과적으로 무사). `react.md`의 "다음 두 장"도 그림 두 장이다. `book-plan.md`의 변경 이력에 든 "전체 10장 → 13장" 같은 문장은 과거 기록이므로 재번호 대상에서 제외했다.
  - 검증: `.vscode/*.json` 4개 JSON 파싱 통과, tasks.json에 적은 5개 명령(`go build ./...`, `go vet ./...`, `go test ./...`, `npx tsc --noEmit`, `npm test`) 전부 실제 실행해 통과. `npm run build` 통과, 사이드바 16장·PDF 차례 16장 확인. `dlv`와 `staticcheck`는 이 머신에 미설치라 디버깅 구성은 실행 검증하지 못했고, 원고에도 그렇게 적었다.
- [x] VS Code 장을 로컬 개발 환경 장으로 확장해 Vercel 앞으로 이동 + 마무리 장 신설 (2026-07-10 지시): 13장(VS Code)과 14장(훅)을 맞바꿔 훅을 13장, 로컬 개발 환경을 14장으로 두고 15장 Vercel 바로 앞에 붙였다(로컬 실행 → 배포로 이어지는 흐름). 장을 VS Code 전용에서 로컬 개발 환경 전반으로 넓혀 direnv·`.envrc`·`.env.local`·마이그레이션·로컬 CORS를 추가하고 파일명을 `part2/vscode.md` → `part2/local-dev.md`로 바꿨다. 2부 마지막에 17장 `whats-next.md`를 신설해 책을 맺는다. 전체 16장 → 17장. 기존 supabase.md 말미의 맺음말은 17장으로 옮기고 16장은 17장 예고로 대체.
  - 원고에는 `.envrc`의 실제 값(DB 비밀번호·프로젝트 ref)을 절대 넣지 않고 `<project-ref>` 같은 자리표시자만 썼다. `.envrc`는 gitignore 대상이라 커밋되지 않는다.
  - 검증: 제목·사이드바·PDF 차례 17장 일치, 장 번호 1~17 연속, 참조 방향 검사 0건, `npm run build`·`npm run pdf` 통과.
- [x] Supabase 장 분할 + 신규 3개 장 추가 (2026-07-10 지시): 49.8KB짜리 supabase.md를 성격이 다른 두 이야기로 쪼갬(17장 인증 `supabase-auth.md`, 18장 DB 연결 `supabase-db.md`). 앞서 제안한 1·2·3순위 장을 모두 신설: 15장 `github-actions.md`(Vercel 앞, 로컬 게이트 → 원격 게이트 흐름), 19장 `pwa.md`, 20장 `free-tier.md`. 전체 17장 → 21장.
  - 저장소에 `.github/workflows/ci.yml`을 실제로 추가했다. Go 잡(gofmt -l, build, vet, test, api/→internal/ import 금지 grep)과 web 잡(npm ci, tsc --noEmit, vitest)이 병렬로 돈다. 15장은 이 파일을 인용한다. 이로써 21장의 "CI가 없다"는 서술이 거짓이 되어 해당 절을 E2E 중심으로 다시 썼다.
  - 무료 티어 중복 제거: vercel.md와 supabase.md에 각각 있던 "무료 티어로 어디까지" 절을 20장으로 통합하고, 두 장에는 포인터만 남겼다. 20장의 논지는 "무엇이 가장 먼저 터지는가 = 트래픽도 용량도 아닌 Supabase 미사용 일시정지"다. vercel.md 45.4KB → 44KB, supabase 49.8KB → 두 장으로 분산.
  - 참조 재번호: 15→16, 17→21은 기계적으로, 16장(Supabase)은 문맥마다 17(인증)/18(DB)로 갈려 표식을 심고 13곳을 손으로 판정했다. 13↔14 스왑(훅↔로컬 개발 환경)도 함께 적용.
  - 검증: `ci.yml` YAML 파싱 + 모든 스텝 명령을 로컬에서 실제 실행해 통과 확인(gofmt -l 빈 출력, api/ grep 미검출, go build/vet/test, tsc --noEmit, vitest). 제목·사이드바·PDF 차례 21장 일치, 장 번호 1~21 연속, 참조 방향 검사 0건, `npm run build`·`npm run pdf` 통과.
- [x] 1부 로컬 완결(SQLite) 대개편 + Git 장 신설 (2026-07-11 지시): 책을 도입(intro+1장)/1부/2부 세 단락으로 재편. 1부 「내 컴퓨터에서 웹 앱 완성하기」(2~14장)는 SQLite 로컬 모드로 내 컴퓨터에서 완결되는 이야기로, 2부 「세상에 공개하고 오래 운영하기」(15~22장)는 버전 관리·개발/운영 환경 분리 위의 공개·운영 이야기로 개편. Claude Code·훅·로컬 개발 환경 장(12~14장)이 1부로 이동(파일도 part1/로 이동), 15장 `git.md` 신설(개념 위주: 명령은 에이전트가, 브랜치 정책은 사람이 GitLab flow 단순화로 main=개발/release=운영), 기존 15~21장은 16~22장으로 +1. 1장 기술 선택은 도입 소속이 되고 DB 절이 "SQLite로 시작해 PostgreSQL로 옮긴다"로 뒤집힘.
  - **앱 코드도 실제 변경**(원고가 인용하는 코드가 실재하도록): `internal/litestore/`(SQLite 스토어, embed schema.sql 멱등 적용, modernc.org/sqlite), `internal/handlers`의 `Store` 인터페이스(32개 메서드, pgx `internal/store`와 이중 구현), `internal/auth/local.go`(고정 로컬 사용자), `internal/config`(DATABASE_URL 없으면 sqlite+local, Vercel에서는 기동 거부), `pkg/app`의 New/Engine 분리(Vercel 바이너리에 SQLite 미링크), 프런트 `localMode`(NEXT_PUBLIC_SUPABASE_URL 부재 시 로그인 생략), api.ts의 dev 기본 API 주소(:8080). 환경 변수 0개로 `go run ./cmd/server`+`npm run dev`가 동작(CORS 기본값 포함, E2E 스모크 통과).
  - 내용 이동: 3장의 마이그레이션·RLS 절과 14장의 direnv·환경 변수 절 → 19장으로 이관(용어 상자 소유권 포함). 19장에 개발/운영 DB 분리 절 신설(3층 구조: 로컬 SQLite/개발 프로젝트/운영 프로젝트, 무료 활성 프로젝트 2개 한도는 2026-07-11 요금 페이지 확인). 17장에 Production Branch=release·Preview=개발 확인 절 신설. `.github/workflows/ci.yml`은 push branches [main, release]로 확장, DEPLOY.md에 release·개발 프로젝트 수동 단계 추가.
  - 검증: gofmt/go build/vet/test(litestore 12개 포함 전부 통과), tsc·vitest, 환경 변수 유무 양쪽 `npm run build`, 로컬 모드 E2E(덱→카드→복습→통계→공유), CORS 프리플라이트, next dev 무설정 기동(홈에 "로컬 모드" 렌더), 원고 발췌↔실제 코드 대조(스크립트 검증 다수), `npm run build`(doc)·`npm run pdf`.
  - 수동 단계 남음(사용자 몫): Vercel 대시보드에서 Production Branch를 release로 변경 + 환경 변수 Production/Preview 스코프 등록, 개발용 Supabase 프로젝트 생성. release 브랜치는 이번 커밋 후 생성해 푸시함.
- [x] 2026-07-11 개편 장 통독 검토 (병렬 검토 에이전트 7그룹, 같은 날): 도입·1장 / 2·3장 / 14·15장 / 16·17장 / 18·19장 / 21·22장 / 4·7·11장(발췌 재검증). 15개 장 전부 통과해 `검토 완료`로 승격.
  - 잡은 것: 17장의 개편 전 코드 발췌 2건(cmd/server, api.ts), 3장의 잘못된 실행 계획 서술(DueCards는 뷰 간접화 탓에 card_srs_user_due_idx를 못 탐, EXPLAIN 실측), 도입 그림 3 캡션 뒤 빈 줄 누락(렌더링 깨짐), 이관 잔재 참조(3장 RLS→19장, 14장 cmd/migrate·.envrc, 22장 PostgREST 귀속), 21장 "본 워크플로"→"예고한", 18장 OAuth 앱 등록 귀속 오류, Vercel 대시보드 경로 현행화(Environments), 발췌 무표시 생략 여러 건 복원.
  - 검증 방식: 발췌 전수 실물 대조(생략 표시 제외 줄 단위), 원고 SQL을 앱과 같은 드라이버로 전량 실행(0 실패), 14장 실행 절차 실제 재현(기동 로그·CORS·복습 흐름), 무료 한도는 공식 요금 페이지 재확인(2026-07-11), git log 발췌 해시 대조.
  - 검토 중 저장소에 루트 `CLAUDE.md`를 추가(15장이 권하는 "브랜치 정책을 프로젝트 지침에 기록"을 실재화: main=개발/release=운영, 로컬 모드 실행·검증 명령). 8장의 "Go의 인터페이스" 회고 문장은 7장 Store 인터페이스 포인터로 손봄.
- [x] 부록 A 개발 도구 설치 신설 (2026-07-11 지시): Git·Go·Node.js·sqlite3 필수 4종 + 선택 도구(VS Code, Claude Code)의 OS별(macOS/윈도우/우분투) 설치 안내를 `doc/appendix/setup.md`로 추가. 위치는 도입이 아니라 부록으로 판단(도입 장은 코드 블록 금지 규칙과 충돌, 이미 도구를 갖춘 독자는 통째로 건너뛰는 참조형 내용, OS별 절차는 개정 주기가 빨라 본문과 분리). 사이드바에 "부록" 섹션과 PDF 차례 말미에 부록 항목 추가. 본문 포인터 3곳: 도입(준비물 문단), 2장(sqlite3 준비물 절), 14장(공식 사이트 안내를 부록 A 참조로 교체). 용어 상자 2개(터미널, 패키지 매니저) 신설, 배정표에 등록.
- [ ] 이전부터 남은 통독 검토: 5·6·8·9·10·20장, 부록 A → 8·9·10·11장은 아래 개편으로 폐기 예정이므로 검토 불필요
- [x] 2부 장 수 보강 완료 (2026-07-10): 제안한 3개 장(GitHub Actions·무료 티어·PWA)을 모두 신설하고 Supabase를 분할해 2부가 6장 → 10장이 됐다. 1부 11장 대 2부 10장.
- [ ] (선택) 이후 세션: 필요 시 부록(로컬 개발 환경·배포 절차) 추가 검토
- [x] **앱 프런트엔드를 Go SSR(html/template + htmx)로 전면 전환** (2026-07-11 지시): TypeScript·React·Next.js·Tailwind·npm 빌드 체인을 앱에서 제거하고, Go 서버가 HTML을 직접 렌더링하는 구조로 재작성했다. 책에서 TS·React를 빼고 HTML을 넣기 위한 선행 작업(책은 실제 코드를 인용하므로 앱이 먼저).
  - 새 구조: `internal/web`(페이지 핸들러 + `templates/` html/template + `static/` CSS·htmx·아이콘·PWA 자산, 전부 embed) → `pkg/app`이 기존 JSON API와 같은 Gin 엔진에 등록. Vercel은 `vercel.json`이 모든 경로를 `api/index.go` 함수 하나로 rewrite.
  - 인증은 서버 사이드로: Go가 GoTrue REST로 OAuth PKCE 흐름을 처리(`internal/web/gotrue.go`)하고 세션은 HttpOnly 쿠키(`session.go`, 만료 시 리프레시 자동). 브라우저가 토큰을 만지지 않아 보안이 오히려 개선. supabase-js 의존 소멸. 환경 변수는 `SUPABASE_URL`+`SUPABASE_ANON_KEY`(JWKS URL은 유도).
  - 학습 화면은 무상태 htmx: 카드 큐·라운드·점수를 hidden 필드로 왕복하고 채점마다 서버가 다음 조각을 렌더링(`study.go`). 카드 뒤집기는 체크박스+CSS만으로 동작. CSV 파싱은 Go로 이동(`csvport.go`), 사전 조회도 서버가 대행(`dictionary.go`, hx-swap-oob).
  - 남은 브라우저 JS는 `internal/web/static/app.js` 하나(약 90줄): TTS(Web Speech)·클립보드·오프라인 배너·서비스 워커 등록·시간대 쿠키. 서비스 워커(`sw.js`)는 페이지 network-first로 조정.
  - 삭제: `src/` 전체, next.config.ts, tsconfig.json, 루트 package.json 등. `doc/`(VitePress)만 npm을 유지. CI에서 web 잡 제거. run_local.sh는 서버 하나만 띄움(포트 8080). README·DEPLOY.md·CLAUDE.md·.env.local.example 현행화.
  - 검증: go build/vet/test 전체 통과(웹 패키지 테스트 6개 신규: CSV 매핑·사전 매핑·템플릿 파싱/렌더링), 로컬 모드 실기동으로 전 흐름 확인(덱·카드 CRUD, CSV 가져오기/내보내기, 학습 오답→재도전 라운드→완료 통계, 공유/해제/갤러리, 스마트 덱, 설정 저장, 사전 채우기 실호출, 404, 정적 자산·manifest·sw).
  - 수동 단계 남음(사용자 몫): Vercel 환경 변수에 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 추가(`NEXT_PUBLIC_*` 3종·`SUPABASE_JWKS_URL`은 제거 가능), Supabase URL Configuration의 Redirect URL을 `/auth/callback` 그대로 유지하되 로컬은 `http://localhost:8080/auth/callback`으로 교체, Vercel 프로젝트 Framework Preset을 Other로 변경(기존 Next.js 감지 해제).
- [x] **책 재편: TypeScript·React를 빼고 HTML을 넣는다** (2026-07-11 지시, 같은 날 완료. 병렬 집필 에이전트 9개):
  - 폐기: 구 8~11장(typescript.md, typescript-async.md, react.md, react-next.md, 약 93KB). 전체 22장 → 21장 재번호(구 12~22장이 −1씩).
  - 신설: 8장 `html-css.md`(문서 뼈대·시맨틱·폼·선택자·박스 모델·flex/grid·다크 모드·CSS만으로 카드 뒤집기, 33KB), 9장 `go-templates.md`(액션 문법·레이아웃/조각과 base Clone·FuncMap·컨텍스트 자동 이스케이프와 XSS·embed·PRG와 플래시, 30KB), 10장 `htmx.md`(hx-속성·조각 응답·무상태 학습 화면·hx-swap-oob·HX-Redirect·app.js 해부, 33KB).
  - 전면 재작성: 17장 supabase-auth(서버 사이드 OAuth PKCE·HttpOnly 쿠키·자동 리프레시·safeNext·쿠키/Bearer 이중 경로, supabase-js는 "절제" 목록으로 이동, 49KB).
  - 연쇄 수정: 1장(왜 서버 렌더링+htmx인가 절 신설, 네 계층, 정적 타입 논의를 Go 문맥으로 이관), intro·index(아키텍처·준비물 Go 하나·로드맵), 4장(config.go 발췌 갱신), 7장(web.New 등록·CORS 재작성·JSON API의 자리), 11·12장(Go 전용 검증), 13장(명령 하나·새 .vscode 해부), 15장(web 잡 삭제), 16장(함수 하나가 전부 서빙·정적 자산 절 신설·Framework Other), 18장(환경 변수 절 재작성: SUPABASE_URL·ANON_KEY, NEXT_PUBLIC 소멸), 19장(정적 manifest·sw.js v2 network-first 논증·웹 앱 매니페스트 상자 이관), 20·21장·부록 A(Node 절 삭제) 갱신. 사이드바·PDF 차례·config description·DEPLOY.md 장 번호 정합.
  - 인프라 수정: VitePress가 인라인 코드의 `{{ }}`를 Vue 보간으로 해석해 빌드가 깨지는 문제를 `.vitepress/config.ts`의 markdown.config에서 code_inline에 v-pre를 붙여 전역 해결(9장부터 Go 템플릿 표기가 본문에 흔해서 필수).
  - 검증: 삭제 파일 링크 잔재 0건, H1 1~21 연속, 스택 잔재 grep 전수(남은 것은 전부 대안 비교·절제 서술·git log 원문), `npm run build` 통과.
  - 남은 일: 재편 장 통독 검토(진도표의 `초안 완료` 장들), 화면 캡처 재촬영(UI가 거의 동일하게 재현됐지만 재배포 후 다시 찍는 것이 안전).
