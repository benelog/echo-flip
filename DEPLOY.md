# 배포 가이드 (전부 무료 티어)

순서대로 진행하면 됩니다. 직접 해야 하는 작업은 ✋ 표시.

## 1. Supabase 프로젝트 ✋

1. https://supabase.com → New project, 리전은 **East US (North Virginia)** 선택
   (Vercel 함수 기본 리전 iad1과 같은 곳이어야 API↔DB가 빠릅니다. 서울 리전을 고르면 안 됩니다.)
2. 프로젝트 대시보드 → **Connect** 버튼에서 연결 문자열 2개 복사:
   - **Transaction pooler (port 6543)** → `DATABASE_URL` (API용)
   - **Direct connection (port 5432)** 또는 Session pooler → `MIGRATE_DATABASE_URL` (마이그레이션용)
3. Settings → API에서 **Project URL**과 **anon(public) key** 복사
4. 같은 방법으로 **개발용 프로젝트**를 하나 더 생성 (운영 DB/개발 DB 분리, 이유는 책 19장 참고).
   개발용 프로젝트의 값들은 로컬 개발과 Vercel **Preview** 스코프(6단계)에 씁니다.

## 2. DB 마이그레이션

```bash
MIGRATE_DATABASE_URL='<direct 연결 문자열>' go run ./cmd/migrate
```

Supabase Table Editor에 `profiles, decks, cards, card_srs, study_sessions, review_logs, smart_decks` 테이블이 보이면 성공.
모든 테이블은 RLS enabled + 정책 0개 상태라 anon key로는 PostgREST 접근이 차단됩니다 (Go API만 접근 가능).

## 3. OAuth 앱 등록 ✋

**Google** — https://console.cloud.google.com
1. 프로젝트 생성 → APIs & Services → OAuth consent screen 설정 (External, 앱 이름 echo-flip)
2. Credentials → Create Credentials → OAuth client ID → Web application
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Client ID/Secret을 Supabase → Authentication → Sign In / Providers → Google에 입력하고 Enable

**GitHub** — https://github.com/settings/developers
1. New OAuth App, Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Client ID/Secret을 Supabase → Providers → GitHub에 입력하고 Enable

**Redirect URL 등록** — Supabase → Authentication → URL Configuration
- Site URL: `https://<앱>.vercel.app` (배포 후 실제 URL로)
- Additional Redirect URLs: `http://localhost:3000/auth/callback`, `https://<앱>.vercel.app/auth/callback`

## 4. 로컬에서 확인

`.env.local.example`를 `.env.local`로 복사해 값 채우고:

```bash
DATABASE_URL='<pooler 6543>' SUPABASE_JWKS_URL='https://<ref>.supabase.co/auth/v1/.well-known/jwks.json' \
  ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server   # 터미널 1
npm run dev                                                    # 터미널 2
```

- http://localhost:3000 → Google/GitHub 로그인 왕복 확인
- 덱 만들기 → 카드 추가("사전에서 채우기" 시험) → 학습(일부러 틀려서 재도전 라운드 확인)
- `curl http://localhost:8080/api/healthz` → `{"ok":true}`
- 토큰 없이 `curl http://localhost:8080/api/me` → 401 확인

## 5. GitHub 저장소 ✋

```bash
git remote add origin git@github.com:benelog/echo-flip.git
git push -u origin main
git branch release && git push origin release   # 운영 배포용 브랜치 (main = 개발용)
```

## 6. Vercel ✋

1. https://vercel.com → Add New Project → echo-flip 저장소 import (Framework: Next.js 자동 감지, Root Directory는 저장소 루트 그대로)
2. Settings → Git → **Production Branch**를 `main`에서 `release`로 변경
   (이후 release 푸시/병합 = 운영 배포, main 푸시 = Preview 배포 = 개발 확인용 고유 URL)
3. Environment Variables 등록 — 스코프를 나눠 **Production에는 운영 Supabase 프로젝트 값, Preview에는 개발 프로젝트 값**을 넣습니다 (분리 이유는 책 19장):
   | 이름 | 값 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `NEXT_PUBLIC_API_URL` | (빈 값으로 두거나 아예 만들지 않기 — 같은 오리진) |
   | `DATABASE_URL` | Transaction pooler 문자열 (6543) |
   | `SUPABASE_JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
4. `git push origin release`(또는 main→release 병합)로 운영 배포 → 발급된 URL을 Supabase URL Configuration(3단계)에 반영

`vercel.json`이 `/api/*`를 Go 함수(`api/index.go`)로 라우팅하고, 함수 리전은 iad1로 고정되어 있습니다.

## 7. Android에 설치

배포된 URL을 Android Chrome으로 열고 → 메뉴 → **"홈 화면에 추가"**.
독립 실행형(standalone) PWA로 설치되어 앱처럼 동작합니다. iOS Safari도 "홈 화면에 추가"로 동일하게 사용 가능.

## 문제 해결

- **로그인 후 다시 로그인 페이지로**: Supabase URL Configuration의 Redirect URL에 배포 URL이 없는 경우.
- **API가 500 "jwks unavailable"**: `SUPABASE_JWKS_URL` 오타. 구형 프로젝트(HS256)라면 대신 `SUPABASE_JWT_SECRET`(Settings → API → JWT Secret)을 설정해도 됩니다.
- **API가 느림(첫 요청)**: 서버리스 콜드스타트 + JWKS 첫 조회. 이후 요청은 빠릅니다.
- **DB 연결 오류 "prepared statement"**: `DATABASE_URL`이 direct(5432)로 되어 있는 경우 transaction pooler(6543)로 교체.
