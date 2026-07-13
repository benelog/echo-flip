# Flashcard 프로젝트 지침

## 브랜치 정책 (GitLab flow 단순화)

- `main`: 개발 브랜치. 모든 작업은 main에서 한다. main 푸시는 Vercel Preview 배포(개발 환경)로 이어진다.
- `release`: 운영 브랜치. 직접 커밋하지 않는다. 운영 배포는 main → release 병합으로만 한다.
- 두 브랜치 모두 push 전에 아래 검증이 통과해야 한다(CI도 같은 검사를 돌린다).

## 구조

- UI는 Go 서버가 렌더링한다: `internal/web` (html/template + htmx + 순수 CSS, 전부 바이너리에 embed).
- 브라우저 JS는 `internal/web/static/app.js` 하나뿐(TTS·클립보드·오프라인·서비스 워커). 프런트엔드 빌드 도구(npm 등)는 앱에 없다. `doc/`(책, VitePress)만 자체 package.json을 가진다.
- JSON API(`/api/*`)는 `internal/handlers`에 그대로 있다. HTML과 API가 같은 Gin 엔진(`pkg/app`)에 물린다.

## 환경

DB는 환경마다 완전히 분리되어 있다.

| 환경 | 배포 | DB | 로그인 |
|---|---|---|---|
| local | `./run_local.sh` | SQLite (`local-db/flashcard.db`) | 없음(고정 사용자) |
| dev | main 푸시 → Vercel **Preview** | 개발용 Supabase 프로젝트 | GitHub/Google |
| production | release 병합 → Vercel **Production** | 운영 Supabase 프로젝트 | GitHub/Google |

- `./run_dev.sh`: local에서 **dev DB**에 붙어 서버를 띄운다(GitHub/Google 로그인 포함). 값은 `.env.dev`에서 읽는다(`.env.dev.example` 참고).
- 개발 환경 값의 단일 출처는 `.env.dev` 하나다. `.envrc`는 `dotenv .env.dev` 한 줄이라 direnv 사용자는 셸에도 같은 값이 올라온다. **운영 값은 로컬에 두지 않는다**(운영 반영은 release 병합 시 GitHub Actions가 한다).
- 환경 구분은 `internal/config`가 `DATABASE_URL` 유무로 한다(있으면 postgres+supabase, 없으면 sqlite+local). 그래서 `run_local.sh`는 `env -u DATABASE_URL`로 실행한다. direnv로 dev 값이 셸에 올라와 있어도 로컬 모드가 SQLite로 뜨게 하기 위함이다.

## 스키마 관리

- Postgres 스키마의 단일 소스는 `internal/db/migrations/*.up.sql`(golang-migrate, 바이너리에 embed). 새 변경은 항상 새 번호의 up/down 쌍을 추가한다 — 기존 파일은 고치지 않는다.
- 적용은 `cmd/migrate`가 한다. `.github/workflows/migrate.yml`이 **스키마 SQL이 바뀐 푸시에만** 자동 실행한다: main → dev DB, release → 운영 DB.
- local에서 dev DB에 미리 적용해 보려면 `./migrate_dev.sh`. 운영 DB에는 수동으로 적용하지 않는다.
- 마이그레이션과 Vercel 배포는 서로를 기다리지 않는다. 컬럼 삭제·이름 변경은 배포 순서에 상관없이 안전하도록 두 단계(추가 → 코드 전환 → 제거)로 나눈다.
- SQLite(`internal/litestore/schema.sql`)는 위 마이그레이션을 손으로 옮긴 포팅본이다. Postgres 마이그레이션을 추가하면 **같은 커밋에서 이 파일도 함께 고쳐야** 두 환경이 어긋나지 않는다.

## 검증

- `go build ./... && go vet ./... && go test ./...` (gofmt는 훅이 자동 적용)
