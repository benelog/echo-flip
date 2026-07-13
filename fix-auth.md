# 로그인 실패 사후 기록 (2026-07-11) — 종결

> **상태: 종결.** 아래 세 원인의 조치가 모두 적용됐고, 2026-07-14에 dev·production 양쪽의 배선을 다시 실측해 확인했다.
> 이 문서는 과거 장애의 기록이다. 진행 중인 작업 목록이 아니다.
> 조사 중에 세운 가설과 폐기된 시도는 걷어냈고, 다시 겪지 않기 위해 남길 값이 있는 것만 남겼다.

2026-07-11, 배포 정상화(환경 변수 등록, `framework: null`) 직후 개발·운영 양쪽에서 로그인이 실패했다.
원인은 서로 무관한 세 가지였고, 하나씩 분리해 잡았다.

## 원인 1: 환경 변수 값에 섞인 개행

운영 로그인 실패의 근본 원인이다.

Vercel에 등록된 `SUPABASE_ANON_KEY` 값 **중간에 개행 문자**가 들어 있었다(긴 키를 터미널에서 복사할 때 줄바꿈이 섞인 형태로 추정).
Go의 HTTP 클라이언트는 헤더 값에 제어 문자가 있으면 요청을 보내지 않고 거부하므로, 토큰 교환 요청이 GoTrue에 **도달조차 하지 못했다**.
진단 패치 배포 후 Vercel Logs에 찍힌 `net/http: invalid header field value for "Apikey"`가 결정적 증거였고, GoTrue의 flow state가 소비되지 않고 살아 있던 정황과도 일치했다.

조치는 두 단계였다.
값 자체는 저자가 대시보드에서 한 줄로 재입력해 근본 해결했다.
코드 쪽에는 `internal/config`가 모든 환경 변수를 `strings.TrimSpace`로 읽는 방어와 회귀 테스트(`TestLoadTrimsWhitespace`)를 남겼다.
값 **중간**의 공백까지 지우던 임시 조치(`envKey`)는 값이 정상이 된 뒤 제거했다.
설정 값을 코드가 조용히 변형하기 시작하면, 잘못된 값이 잘못된 채로 동작해 다음 사고를 부르기 때문이다.

## 원인 2: Preview 배포가 Vercel 인증에 막혀 있었다

개발 환경에는 로그인 시도가 앱에 닿지도 못했다.
Vercel이 Preview 배포에 기본으로 켜 두는 Deployment Protection(Vercel Authentication)이 모든 요청을 가로채, `/auth/login/google` 요청이 앱이 아니라 `https://vercel.com/sso-api?...`로 리다이렉트되고 있었다.
OAuth 콜백 왕복도 같은 벽에 막힌다.

조치: Settings → Deployment Protection → Vercel Authentication을 **Disabled**로(Hobby 플랜에서 가능).

## 원인 3: 브랜치와 환경이 뒤바뀌어 있었다

Vercel의 Production Branch가 `main`으로 설정되어 있어서, **main에 푸시하면 곧장 운영 도메인에 운영 Supabase로 배포**됐다.
의도한 정책(14·16장, DEPLOY.md)은 그 반대다.
개발과 운영의 분리 자체가 성립하지 않던 상태였다.

조치: Settings → Environments → Production → Branch Tracking을 `release`로 변경.

## 현재 구성 (2026-07-14 실측)

| 환경 | URL | Supabase 프로젝트 |
|---|---|---|
| dev | https://flashcard-dev.vercel.app | `aueafzjlmqdtcfrkctzx` (개발) |
| production | https://flashcard.benelog.net | `kncwqneczvkugkflqwpe` (운영) |

각 배포의 `/auth/login/google` 리다이렉트가 서로 다른 프로젝트를 가리키는 것으로 확인했다.
Vercel의 Preview 스코프에는 개발 프로젝트 값이, Production 스코프에는 운영 프로젝트 값이 들어 있다는 뜻이다.
스키마 적용은 `.github/workflows/migrate.yml`이 브랜치를 보고 대신 한다(main → 개발 DB, release → 운영 DB).

## 조사 중 발견해 고친 진단 공백 (적용 완료)

원인 추적을 막았던 두 곳이다. 원인 확정과 별개로 고쳐 두었다.

- `internal/web/authpages.go`: 콜백이 GoTrue의 `error`·`error_description`을 검사하지 않고 버려서, 프로바이더 쪽 실패가 "code 없음"과 구분되지 않았다. 지금은 로그로 남기고 사용자 메시지도 구분한다.
- `internal/web/gotrue.go`: 토큰 교환 실패 시 응답 본문을 버리고 상태 코드만 남겨서(`status 400`) 로그만 봐서는 원인을 알 수 없었다. 지금은 본문을 에러에 담는다.

## 다시 겪지 않기 위한 점검 순서

로그인이 실패하면 이 순서로 좁힌다.

1. **콜백 URL을 본다.** 실패 직후 브라우저 방문 기록에서 `/auth/callback`을 찾는다. `?error=...`가 붙어 있으면 GoTrue나 OAuth 프로바이더 쪽 문제이고(`error_description`이 원인 문장이다), `?code=...`만 있으면 앱 쪽 문제다.
2. **Vercel Logs를 본다.** `net/http: invalid header field value`가 보이면 환경 변수 값에 개행이나 제어 문자가 섞인 것이다. 값을 다시 한 줄로 입력한다.
3. **PKCE 쿠키 만료를 의심한다.** `fc_pkce`는 Max-Age 300초다. 구글 계정 선택 화면에서 5분 이상 지체하면 콜백 시점에 verifier가 없어 실패한다. 간헐적 실패의 흔한 원인이다.
4. **Redirect URL 목록을 확인한다.** Supabase → Authentication → URL Configuration에 그 배포의 `/auth/callback`이 등록되어 있어야 한다. 배포 주소가 바뀌면 여기도 함께 바꾼다.
