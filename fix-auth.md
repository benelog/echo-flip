# 로그인 실패 조사 기록 (fix-auth.md)

> **결론 (2026-07-11 확정)**: production 로그인 실패의 근본 원인은 Vercel에 등록된 `SUPABASE_ANON_KEY` 값 끝에 딸려 들어간 **개행 문자**였다.
> 진단 패치 배포 후 Vercel Logs에 `net/http: invalid header field value for "Apikey"`가 찍혔다. Go의 HTTP 클라이언트는 헤더 값에 제어 문자가 있으면 요청을 보내지 않고 거부하므로, 토큰 교환 요청이 GoTrue에 도달조차 못 했다(flow state가 소비되지 않고 살아 있던 증거와 일치).
> 수정: `internal/config`가 모든 환경 변수를 `strings.TrimSpace`로 읽도록 방어를 추가하고 회귀 테스트를 붙였다. 대시보드 값을 다시 입력할 필요는 없다.
> **추가 확정 (같은 날)**: TrimSpace 배포 후에도 같은 에러가 재발했다. 개행이 값의 가장자리가 아니라 **중간**에 있다는 뜻이다(긴 키를 터미널 등에서 복사할 때 줄바꿈이 섞여 들어간 형태로 추정). API 키에는 공백이 있을 수 없으므로 `SUPABASE_ANON_KEY`·`SUPABASE_JWT_SECRET`은 내부 공백까지 전부 제거하는 `envKey`로 읽도록 강화했다. 근본적으로는 대시보드 값을 한 줄로 재입력하는 것이 깨끗하다.
> preview의 Vercel 배포 보호, Production Branch 뒤바뀜(main↔release)도 같은 날 함께 발견해 해결했다. 상세는 아래.

2026-07-11, 배포 정상화(환경 변수 등록·`framework: null`) 직후 preview·production 양쪽에서 로그인 실패가 보고되어 조사한 기록이다.
바깥(curl)에서 검증 가능한 구간은 전부 실측했고, 남은 구간은 아래 "다음 단계"의 증거로 좁힌다.

## 증상

- **preview**(`echo-flip-git-main-sanghyuk-jungs-projects.vercel.app`): 로그인 시도가 앱에 닿지 못함.
- **production**(`echo-flip-delta.vercel.app`): 구글 계정 선택까지는 진행되나 "로그인에 실패했어요. 다시 시도해주세요." 플래시와 함께 로그인 화면으로 복귀. 한 차례는 성공이 보고되어 간헐적일 가능성 있음.

## 확정 원인 1: preview는 Vercel 배포 보호에 막혀 있다

- 실측: `https://echo-flip-git-main-….vercel.app/auth/login/google` 요청이 앱이 아니라 `https://vercel.com/sso-api?...`로 리다이렉트된다. Vercel이 preview 배포에 기본으로 켜 두는 Deployment Protection(Vercel Authentication)이 모든 요청을 가로채는 것.
- 영향: 프로젝트에 접근 권한이 있는 Vercel 계정으로 인증한 브라우저가 아니면 preview의 어떤 페이지도 열 수 없다. OAuth 콜백 왕복도 같은 벽에 막힌다.
- **해결(대시보드)**: 프로젝트 Settings → Deployment Protection → Vercel Authentication을 **Disabled**로. Hobby 플랜에서 가능.

## 확정 원인 2: Production Branch가 main으로 설정되어 브랜치-환경이 뒤바뀌었다

GitHub deployments 기록(Vercel이 남긴 것)이 설정값을 증언한다:

| 시각(UTC) | 브랜치 푸시 | 커밋 | Vercel 환경 |
|---|---|---|---|
| 11:50 | main | 6fc32b8 | **Production** |
| 11:46 | release | cb82cfe | **Preview** |
| 11:21 | main | cb82cfe | **Production** |
| 11:11 | release | b5228a6 | **Preview** |

- 의도한 정책(책 16장, README, DEPLOY.md, CLAUDE.md): main 푸시 → Preview(개발), release 푸시 → Production(운영).
- 현재 동작: 정반대. **main에 푸시하면 곧장 운영 도메인(`echo-flip-delta.vercel.app`)에 운영 Supabase(Production 스코프 환경 변수)로 배포된다.** 개발/운영 분리가 성립하지 않는 상태다.
- **해결(대시보드)**: 프로젝트 Settings → Environments → Production → Branch Tracking(구 UI는 Settings → Git → Production Branch)을 `release`로 변경.

## production 로그인: 검증 완료 구간 (전부 정상)

| 구간 | 확인 방법 | 결과 |
|---|---|---|
| 앱 → GoTrue authorize | `/auth/login/google` 리다이렉트 추적 | 운영 프로젝트(`kncwqneczvkugkflqwpe`), PKCE 쿠키(`ef_pkce`·`ef_next`, Max-Age 300) 발급, `redirect_to=https://echo-flip-delta.vercel.app/auth/callback` 정상 |
| GoTrue → 구글 | authorize 응답의 Location 파싱 | client_id 존재, `redirect_uri=https://kncwqneczvkugkflqwpe.supabase.co/auth/v1/callback` 정상 |
| Site URL | GoTrue 콜백에 무효 state를 보내 폴백 관찰 | `https://echo-flip-delta.vercel.app/`로 정상 설정 |
| 콜백 배관 | 가짜 code + 실제 쿠키로 `/auth/callback` 호출 | 플래시 설정 후 `/login` 303, 설계대로 동작 |
| `SUPABASE_ANON_KEY` | Vercel Production 스코프 값(`sb_publishable_vZkn…`)으로 GoTrue 직접 호출 | `/auth/v1/settings` 200, 토큰 엔드포인트가 키를 수용(`flow_state_not_found`는 가짜 코드 탓) → **키는 운영 프로젝트에서 유효** |
| GoTrue 설정 | `/auth/v1/settings` 본문 | `disable_signup: false`, google·github 프로바이더 활성 |

## 남은 용의자 (production)

콜백 핸들러(`internal/web/authpages.go`의 `oauthCallback`)가 플래시를 띄우는 조건은 세 가지다: `code` 없음, `ef_pkce` 쿠키 없음, 토큰 교환 실패.

1. **Supabase에 등록된 Google Client Secret 불일치** (유력): GoTrue가 구글에서 받은 코드를 교환하지 못하면 우리 콜백에 `?error=server_error&error_description=Unable+to+exchange+external+code`를 붙여 보낸다. 앱이 `error` 파라미터를 검사하지 않고 버리므로 `code` 없음 분기로 빠져 같은 플래시가 뜬다.
2. **PKCE 쿠키 만료**: `ef_pkce`는 300초짜리다. 구글 계정 선택 화면에서 5분 이상 지체하면 콜백 시점에 verifier가 없어 실패한다. 간헐적 성공/실패와 부합.
3. 코드 이중 소비(재시도 탭, 뒤로 가기 등): GoTrue 코드가 이미 소비돼 교환이 실패하는 경우.

## 다음 단계: 결정적 증거 확보

실패를 재현한 직후 Chrome 방문 기록(Ctrl+H)에서 `callback`을 검색해 가장 최근 `echo-flip-delta.vercel.app/auth/callback?...` 항목의 전체 URL을 확인한다.

- `?error=...`가 붙어 있으면 → GoTrue 쪽 실패. `error_description`이 원인 문장이다. "Unable to exchange external code"면 Supabase 대시보드 → Authentication → Sign In / Providers → Google의 Client Secret을 재확인·재입력한다.
- `?code=...`만 있으면 → 앱 쪽 실패(쿠키 소실 또는 교환 실패). 이 둘을 구분하려면 아래 진단 패치가 필요하다.

### 증거 확보 결과 (2026-07-11)

실패한 시도의 콜백 URL은 `?code=09ac2382-…`였고 `error` 파라미터가 없었다. GoTrue와 구글 쪽은 성공했다는 뜻이다(Client Secret 가설 기각).
이어서 그 코드로 운영 GoTrue의 토큰 엔드포인트를 직접 호출하자 `bad_code_verifier`("code challenge does not match previously saved code verifier")가 반환됐다.
flow state가 소비되지 않고 살아 있다는 것은 **서버가 이 코드를 한 번도 성공적으로 교환하지 못했다**는 증거다.
따라서 원인은 콜백 시점의 PKCE 쿠키 문제로 확정된다: 쿠키가 만료됐거나(Max-Age 300초), 다른 로그인 시도가 쿠키를 덮어써 verifier와 challenge가 어긋난 경우다.
간헐적 성공/실패와도 부합한다.
어느 쪽인지는 아래 진단 패치가 배포된 뒤의 플래시 메시지(또는 Vercel Logs)로 판별한다: "로그인 확인 정보가 만료됐어요"면 쿠키 소실, "로그인에 실패했어요"면 교환 거부(로그에 GoTrue 응답 본문이 남는다).

## 앱 진단 공백 (패치 권고)

이번 조사에서 원인 추적을 막은 두 곳. 원인 확정과 별개로 고쳐 둘 가치가 있다.

- `oauthCallback`이 GoTrue의 `error`·`error_description` 쿼리 파라미터를 검사하지 않는다 → `log.Printf`로 남기고, 사용자 메시지도 구분한다.
- `gotrue.go`의 `token()`이 교환 실패 시 응답 본문을 버리고 상태 코드만 남긴다(`gotrue pkce: status 400`) → 본문을 에러 메시지에 포함해 Vercel Logs에서 원인이 보이게 한다.
- 부수 발견: 핸들러가 교환 에러를 로그로도 남기지 않아 Vercel Logs가 비어 있다.

## 해결 순서 요약

1. ~~(대시보드) Production Branch를 `release`로~~ → **완료·검증됨** (2026-07-11 12:46 재배포에서 main 푸시 → Preview, release 푸시 → Production으로 정렬 확인)
2. ~~(대시보드) Deployment Protection의 Vercel Authentication 해제~~ → **완료·검증됨** (preview가 SSO 대신 앱의 `/login`으로 응답)
3. (대시보드) preview의 Supabase 배선: **미완**. 재배포 후에도 preview가 운영 프로젝트(`kncwqneczvkugkflqwpe`)로 authorize를 보낸다. Preview 스코프에 개발용 프로젝트의 `SUPABASE_URL`·`SUPABASE_ANON_KEY`·`DATABASE_URL`이 등록되어 있지 않다는 뜻(개발용 프로젝트 미생성 가능성, DEPLOY.md 1단계-4). 임시로 preview 로그인을 살리려면 운영 프로젝트의 Redirect URL 허용 목록에 `https://echo-flip-git-main-….vercel.app/auth/callback`을 추가하는 방법도 있으나, 개발 트래픽이 운영 DB로 가는 상태는 그대로다.
4. (증거) production 실패 재현 → 방문 기록의 콜백 URL 확보 → 원인 확정: **대기 중**
5. (코드) 진단 패치 적용 후, 원인에 맞는 수정
