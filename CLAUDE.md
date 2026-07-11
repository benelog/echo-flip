# Echo Flip 프로젝트 지침

## 브랜치 정책 (GitLab flow 단순화)

- `main`: 개발 브랜치. 모든 작업은 main에서 한다. main 푸시는 Vercel Preview 배포(개발 환경)로 이어진다.
- `release`: 운영 브랜치. 직접 커밋하지 않는다. 운영 배포는 main → release 병합으로만 한다.
- 두 브랜치 모두 push 전에 아래 검증이 통과해야 한다(CI도 같은 검사를 돌린다).

## 구조

- UI는 Go 서버가 렌더링한다: `internal/web` (html/template + htmx + 순수 CSS, 전부 바이너리에 embed).
- 브라우저 JS는 `internal/web/static/app.js` 하나뿐(TTS·클립보드·오프라인·서비스 워커). 프런트엔드 빌드 도구(npm 등)는 앱에 없다. `doc/`(책, VitePress)만 자체 package.json을 가진다.
- JSON API(`/api/*`)는 `internal/handlers`에 그대로 있다. HTML과 API가 같은 Gin 엔진(`pkg/app`)에 물린다.

## 실행

- 로컬 모드: 환경 변수 없이 `go run ./cmd/server` (SQLite, local-db/echo-flip.db, 로그인 불필요) → http://localhost:8080
- 운영 구성(PostgreSQL/Supabase)은 `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`로 켠다. `.env.local.example` 참고.

## 검증

- `go build ./... && go vet ./... && go test ./...` (gofmt는 훅이 자동 적용)
