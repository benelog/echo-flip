# Echo Flip 프로젝트 지침

## 브랜치 정책 (GitLab flow 단순화)

- `main`: 개발 브랜치. 모든 작업은 main에서 한다. main 푸시는 Vercel Preview 배포(개발 환경)로 이어진다.
- `release`: 운영 브랜치. 직접 커밋하지 않는다. 운영 배포는 main → release 병합으로만 한다.
- 두 브랜치 모두 push 전에 아래 검증이 통과해야 한다(CI도 같은 검사를 돌린다).

## 실행

- 로컬 모드: 환경 변수 없이 `go run ./cmd/server`(SQLite, echo-flip.db) + `npm run dev`. 로그인 불필요.
- 운영 구성(PostgreSQL/Supabase)은 `DATABASE_URL` 등 환경 변수로 켠다. `.env.local.example` 참고.

## 검증

- Go: `go build ./... && go vet ./... && go test ./...` (gofmt는 훅이 자동 적용)
- Web: `npx tsc --noEmit && npm test`
