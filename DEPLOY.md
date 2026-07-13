# 배포 가이드 (전부 무료 티어)

순서대로 진행하면 됩니다. 직접 해야 하는 작업은 ✋ 표시.

## 1. Supabase 프로젝트 ✋

1. https://supabase.com → New project, 리전은 **East US (North Virginia)** 선택
   (Vercel 함수 기본 리전 iad1과 같은 곳이어야 API↔DB가 빠릅니다. 서울 리전을 고르면 안 됩니다.)
2. 프로젝트 대시보드 → **Connect** 버튼에서 연결 문자열 2개 복사:
   - **Transaction pooler (port 6543)** → `DATABASE_URL` (서버용)
   - **Direct connection (port 5432)** 또는 Session pooler → `MIGRATE_DATABASE_URL` (마이그레이션용)
3. Settings → API에서 **Project URL**(`SUPABASE_URL`)과 **anon(public) key**(`SUPABASE_ANON_KEY`) 복사
4. 같은 방법으로 **개발용 프로젝트**를 하나 더 생성 (운영 DB/개발 DB 분리, 이유는 책 18장 참고).
   개발용 프로젝트의 값들은 로컬 개발과 Vercel **Preview** 스코프(6단계)에 씁니다.

## 2. DB 마이그레이션

첫 1회는 손으로, 이후에는 GitHub Actions가 자동으로 합니다.

```bash
MIGRATE_DATABASE_URL='<direct 연결 문자열>' go run ./cmd/migrate
```

**운영·개발 프로젝트 각각** 실행합니다 (연결 문자열만 바꿔서 두 번).
Supabase Table Editor에 `profiles, decks, cards, card_srs, study_sessions, review_logs, smart_decks` 테이블이 보이면 성공.
모든 테이블은 RLS enabled + 정책 0개 상태라 anon key로는 PostgREST 접근이 차단됩니다 (Go 서버만 접근 가능).

## 3. OAuth 앱 등록 ✋

**Google** — https://console.cloud.google.com
1. 프로젝트 생성 → APIs & Services → OAuth consent screen 설정 (External, 앱 이름 flashcard)
2. Credentials → Create Credentials → OAuth client ID → Web application
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Client ID/Secret을 Supabase → Authentication → Sign In / Providers → Google에 입력하고 Enable

**GitHub** — https://github.com/settings/developers
1. New OAuth App, Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Client ID/Secret을 Supabase → Providers → GitHub에 입력하고 Enable

**개발용 Supabase 프로젝트에도 같은 OAuth 앱 연결** — 앱을 새로 만들 필요는 없습니다.
1. Google OAuth 클라이언트의 Authorized redirect URI와 GitHub OAuth App의 callback URL에
   개발 프로젝트 주소 `https://<dev-project-ref>.supabase.co/auth/v1/callback`을 **추가**
2. 같은 Client ID/Secret을 개발 프로젝트의 Providers에도 입력하고 Enable

**Redirect URL 등록** — Supabase → Authentication → URL Configuration

운영 프로젝트:
- Site URL: `https://<앱>.vercel.app` (배포 후 실제 URL로)
- Additional Redirect URLs: `https://<앱>.vercel.app/auth/callback`

개발 프로젝트:
- Site URL: `https://<앱>-git-main-<계정>.vercel.app` (main 브랜치 Preview의 **고정 alias**.
  배포마다 바뀌는 고유 URL이 아니라 이 alias를 등록해야 합니다.)
- Additional Redirect URLs: `https://<앱>-git-main-<계정>.vercel.app/auth/callback`,
  `http://localhost:8080/auth/callback` (로컬에서 개발 DB에 붙을 때)

## 4. 로컬에서 확인

`.env.local.example`를 참고해 셸에 export 하고:

```bash
DATABASE_URL='<pooler 6543>' \
SUPABASE_URL='https://<ref>.supabase.co' SUPABASE_ANON_KEY='<anon key>' \
  go run ./cmd/server
```

- http://localhost:8080 → Google/GitHub 로그인 왕복 확인
- 덱 만들기 → 카드 추가("사전에서 채우기" 시험) → 학습(일부러 틀려서 재도전 라운드 확인)
- `curl http://localhost:8080/api/healthz` → `{"ok":true}`
- 토큰 없이 `curl http://localhost:8080/api/me` → 401 확인

## 5. GitHub 저장소 ✋

```bash
git remote add origin git@github.com:benelog/flashcard.git
git push -u origin main
git branch release && git push origin release   # 운영 배포용 브랜치 (main = 개발용)
```

**마이그레이션 시크릿 등록** — Settings → Secrets and variables → Actions → New repository secret

| 이름 | 값 |
|---|---|
| `DEV_MIGRATE_DATABASE_URL` | 개발 프로젝트의 **Session pooler / direct (5432)** 문자열 |
| `PROD_MIGRATE_DATABASE_URL` | 운영 프로젝트의 **Session pooler / direct (5432)** 문자열 |

이후 `internal/db/migrations/`가 바뀐 커밋을 푸시하면 `.github/workflows/migrate.yml`이
자동으로 마이그레이션을 적용합니다 — main이면 개발 DB, release면 운영 DB.
포트 6543(transaction pooler)은 advisory lock을 지원하지 않아 여기 쓰면 실패합니다.
GitHub Actions 러너는 IPv4라, Supabase의 IPv6 전용 direct 호스트(`db.<ref>.supabase.co`) 대신
**Session pooler 문자열**을 쓰는 편이 안전합니다.

## 6. Vercel ✋

1. https://vercel.com → Add New Project → flashcard 저장소 import (Root Directory는 저장소 루트 그대로.
   Framework Preset은 `vercel.json`의 `"framework": null`이 덮어쓰므로 무엇으로 감지되든 상관없음)
2. Settings → Environments → Production의 Branch Tracking에서 **Production Branch**를 `main`에서 `release`로 변경
   (이후 release 푸시/병합 = 운영 배포, main 푸시 = Preview 배포 = 개발 확인용 고유 URL)
3. Environment Variables 등록 — 스코프를 나눠 **Production에는 운영 Supabase 프로젝트 값, Preview에는 개발 프로젝트 값**을 넣습니다 (분리 이유는 책 18장):
   | 이름 | 값 |
   |---|---|
   | `DATABASE_URL` | Transaction pooler 문자열 (6543) |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_ANON_KEY` | anon key |
4. 환경 변수는 **다음 배포부터** 적용됩니다. 값을 바꿨다면 main에 푸시하거나 대시보드에서 Redeploy 하세요.
5. `git push origin release`(또는 main→release 병합)로 운영 배포 → 발급된 URL을 Supabase URL Configuration(3단계)에 반영
6. 개발 환경 분리 확인: main Preview URL에서 로그인·덱 생성 후, 데이터가 **개발** 프로젝트 Table Editor에만 쌓이고 운영 프로젝트에는 없는지 확인

`vercel.json`이 **모든 경로**를 Go 함수(`api/index.go`) 하나로 라우팅합니다. HTML 페이지·정적 파일·API를 이 함수가 전부 서빙하며(정적 파일은 Go 바이너리에 embed), 함수 리전은 iad1로 고정되어 있습니다.

## 7. Android에 설치

배포된 URL을 Android Chrome으로 열고 → 메뉴 → **"홈 화면에 추가"**.
독립 실행형(standalone) PWA로 설치되어 앱처럼 동작합니다. iOS Safari도 "홈 화면에 추가"로 동일하게 사용 가능.

## 문제 해결

- **빌드가 `next build`를 실행하다 "Couldn't find any pages or app directory"로 실패**: 저장소가 Next.js였던 시절 import되어 Framework Preset에 Next.js가 남아 있는 경우. `vercel.json`의 `"framework": null`이 프리셋을 덮어쓰므로, 이 설정이 포함된 커밋을 다시 배포하면 된다.
- **로그인 후 다시 로그인 페이지로**: Supabase URL Configuration의 Redirect URL에 배포 URL의 `/auth/callback`이 없는 경우.
- **서버가 500 "jwks unavailable"**: `SUPABASE_URL` 오타(JWKS URL은 여기서 유도). 구형 프로젝트(HS256)라면 대신 `SUPABASE_JWT_SECRET`(Settings → API → JWT Secret)을 설정해도 됩니다.
- **첫 요청이 느림**: 서버리스 콜드스타트 + JWKS 첫 조회. 이후 요청은 빠릅니다.
- **DB 연결 오류 "prepared statement"**: `DATABASE_URL`이 direct(5432)로 되어 있는 경우 transaction pooler(6543)로 교체.
- **오랜만에 Preview를 열었더니 DB 연결 실패**: Supabase 무료 프로젝트는 7일간 미사용 시 자동 정지됩니다.
  대시보드에서 개발 프로젝트를 Restore(unpause)하면 됩니다. 정지된 프로젝트는 무료 2개 한도에 포함되지 않습니다.
- **Preview URL이 Vercel 로그인을 요구**: Settings → Deployment Protection에서 Preview 보호 설정을 확인하세요.
