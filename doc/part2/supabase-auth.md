# 18장 Supabase 인증: OAuth와 JWKS 검증

17장에서 정적 프런트엔드와 Go 서버리스 함수를 Vercel 한 곳에 배포하는 과정을 살펴봤다.
남은 조각은 사용자 인증과 데이터베이스이고, 둘 다 Supabase가 맡는다.
성격이 꽤 다른 두 이야기라 장을 나눴다.
이 장은 인증을, 다음 19장은 데이터베이스 연결을 다룬다.

먼저 1부의 로컬 인증이 운영에서는 왜 안 되는지를 짚고, 왜 다른 대안이 아닌 Supabase였는지, 그리고 Supabase의 어떤 기능을 일부러 쓰지 않았는지를 트레이드오프 관점에서 정리한다.
이어서 브라우저가 OAuth 로그인으로 토큰을 얻고 Go API가 그 토큰을 검증하기까지의 전체 흐름을 실제 코드로 따라간다.
이 장의 핵심 주장은 하나다.
서버가 세션을 기억하지 않는 무상태 구조가, 인스턴스가 언제든 사라지는 서버리스와 정확히 맞물린다는 것이다.

무료 플랜의 한도와 일시정지·백업 같은 운영 문제는 21장에서 Vercel과 함께 묶어 다룬다.

## 로컬 인증에서 운영 인증으로

사실 1부에서 완성한 앱에도 인증의 자리는 있었다.
로컬 모드의 Go API는 모든 요청을 `internal/auth/local.go`의 미들웨어에 통과시키는데, 그 전문이 이만큼 짧다.

```go
// LocalUserID is the fixed identity every request runs as in local mode.
var LocalUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// LocalMiddleware replaces token validation in local single-user mode: it
// signs every request in as LocalUserID, so no Authorization header (and no
// Supabase) is needed. It stands in for both the required and the optional
// middleware.
func LocalMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(userIDKey, LocalUserID)
		c.Next()
	}
}
```

아무것도 검증하지 않고, 누가 보냈든 모든 요청을 미리 정해 둔 사용자 하나로 취급한다.
내 컴퓨터에서 나 혼자 쓰는 동안에는 이것으로 충분했다.
"사용자별 데이터"라는 구조는 그대로 두고, 사용자를 구분할 필요만 없앴다.

세상에 공개하는 순간 이 전제가 무너진다.
요청을 보내는 사람이 여럿이고, 서로가 서로의 덱과 학습 기록을 봐서는 안 되며, "나는 이 사용자다"라는 주장을 말 그대로 믿어 줄 수 없다.
그 주장을 위조할 수 없는 방식으로 확인하는 일이 인증이고, 확인 뒤에도 토큰 수명, 탈취, 위조 서명 같은 공격면이 줄줄이 따라온다.
이 장의 나머지는 저 몇 줄짜리 미들웨어의 자리를 운영에서 무엇이 대신해야 하는가에 대한 이야기다.

물론 검증 없는 인증이 운영에 새어 나가면 그 자체가 보안 구멍이다.
그래서 `internal/config/config.go`는 `DATABASE_URL`이 없을 때만 로컬 모드를 켜고, Vercel 환경에서 `DATABASE_URL`이 빠져 있으면 아예 기동을 거부한다.
배포 설정이 갖춰진 순간 로컬 인증은 선택지에서 사라진다.

## 왜 Supabase인가

도입 장에서 정한 Echo Flip의 비기능 요구사항을 다시 떠올려 보자.
완전 무료 인프라로 운영할 것, 그리고 관리해야 할 플랫폼 수를 최소화할 것.
기능 요구사항을 소화하려면 사용자별 덱과 카드, 학습 기록을 저장할 관계형 데이터베이스가 필요하고, "사용자별"이라는 말이 성립하려면 로그인이 필요하다.

Supabase는 이 두 가지를 한 서비스에서 해결한다.
관리형(managed) PostgreSQL과 OAuth 소셜 로그인을 포함한 인증(authentication) 서비스가 하나의 프로젝트, 하나의 무료 티어 안에 들어 있다.
집필 시점 기준으로 무료 티어는 데이터베이스 500MB와 월간 활성 사용자 5만 명 수준을 제공하는데, 개인용 암기 카드 앱에는 차고 넘치는 용량이다.
결과적으로 Echo Flip이 계정을 만들고 관리하는 외부 플랫폼은 Vercel과 Supabase 딱 두 개다.

::: info [용어 풀이] 관리형 서비스(Managed Service)
서버 설치, 백업, 보안 패치, 확장 같은 운영 작업을 제공업체가 대신 맡고, 사용자는 기능만 가져다 쓰는 서비스다.
집을 직접 짓고 고쳐 가며 사는 대신, 관리사무소가 시설을 돌봐 주는 아파트에 들어가 사는 것과 비슷하다.
1인 개발자가 데이터베이스 운영에 시간을 쏟지 않고 앱 만들기에만 집중할 수 있게 해 준다.
:::

1인 개발자에게 무료 티어는 단순한 비용 절감이 아니라, 실패해도 잃을 것이 없는 실험 환경을 뜻한다.
다만 무료에는 무료의 규칙이 따라붙는데, 구체적인 한도와 일시정지·백업 같은 함정은 Vercel 쪽 한도와 함께 21장에서 묶어 다룬다.

### 인증을 직접 만들면 무엇을 떠안는가

"로그인쯤이야 직접 만들지"라는 생각이 얼마나 위험한지부터 짚어 보겠다.
인증을 자체 구현하면 다음 비용을 전부 떠안게 된다.

첫째, 비밀번호 저장이다.
bcrypt나 argon2 같은 검증된 해시 알고리즘을 올바른 파라미터로 적용해야 하고, 유출 사고가 나면 법적 책임까지 따라온다.

둘째, 소셜 로그인 연동이다.
Google과 GitHub 각각에 OAuth 앱을 등록하고, 인가 코드(authorization code)를 토큰으로 교환하는 콜백 서버를 만들고, 프로바이더마다 미묘하게 다른 응답 형식과 오류 케이스를 처리해야 한다.

셋째, 토큰 수명 관리다.
액세스 토큰의 발급·만료·갱신, 리프레시 토큰의 회전과 폐기, 로그아웃 시 무효화까지 상태 기계 하나를 통째로 운영해야 한다.

넷째, 계정 부대 기능이다.
이메일 검증, 비밀번호 재설정, 계정 탈퇴 같은 기능은 핵심 도메인과 무관하지만 없으면 서비스가 성립하지 않는다.

기능 버그는 고치면 그만이지만 인증 버그는 사고가 된다.
Echo Flip은 이 목록 전체를 관리형 인증에 위임하고, 비밀번호를 아예 받지 않는 쪽을 택했다.
Google/GitHub OAuth만 지원하므로 비밀번호 저장 의무 자체가 생기지 않고, 프런트엔드에서 supabase-js 호출 몇 줄이면 로그인 흐름이 완성된다.

### 대안 비교: 언제 다른 선택이 나은가

Supabase가 유일한 답은 아니니, 검토할 만한 대안과 각각이 더 나은 상황을 정리해 보자.

| 대안 | 제공 범위 | Echo Flip 관점의 한계 | 이 대안이 더 나은 경우 |
|---|---|---|---|
| Neon | 서버리스 Postgres | 인증이 없어 별도 서비스 필요 | 인증 스택이 이미 있거나 DB 브랜칭이 필요할 때 |
| Firebase | 인증 + NoSQL DB + 호스팅 | Firestore는 관계형 스키마와 부적합, 벤더 종속 | 모바일 중심의 실시간 동기화 앱 |
| Auth0 / Clerk | 인증 전문 | DB가 없어 플랫폼이 하나 늘어남 | 엔터프라이즈 SSO·조직 관리가 필요할 때 |
| 자체 호스팅 | 전부 직접 구성 | 고정비와 운영 부담 | 데이터 주권·규제 요구, 서버 운영 역량이 있는 팀 |

Neon은 서버리스 Postgres로는 훌륭한 선택지이고, 브랜치별로 DB 사본을 만드는 브랜칭 기능은 Supabase에 없는 강점이다.
하지만 인증은 제공하지 않으므로 Auth.js나 Clerk 같은 인증 스택을 따로 붙여야 하고, 그 순간 관리할 플랫폼이 하나 늘어난다.
이미 인증을 해결한 프로젝트라면 Neon이 더 가벼운 선택일 수 있다.

Firebase는 인증과 DB를 통합 제공한다는 점에서 Supabase와 가장 비슷한 대안이다.
그러나 Firestore는 NoSQL 문서 저장소라서 3장에서 설계한 관계형 스키마(외래 키 제약, JOIN, 집계 쿼리)를 그대로 옮길 수 없다.
더 큰 문제는 벤더 종속(vendor lock-in)으로, Firestore 전용 API로 작성한 데이터 계층은 다른 곳으로 이식할 수 없지만 Supabase의 DB는 표준 PostgreSQL이라 `pg_dump` 한 번으로 어디로든 옮길 수 있다.
반대로 모바일 SDK와 실시간 동기화가 핵심인 앱이라면 Firebase의 오프라인 지원과 실시간 리스너가 더 나은 답이다.

Auth0와 Clerk는 인증만 놓고 보면 Supabase Auth보다 기능이 깊어서, 엔터프라이즈 SSO나 조직·팀 관리가 필요한 B2B 서비스라면 이쪽이 낫다.
하지만 DB는 별도로 마련해야 하므로 "플랫폼 최소화" 요구와 어긋나고, 무료 티어의 월간 활성 사용자 한도를 넘기면 인증만으로 과금이 시작된다.

자체 호스팅은 VPS에 PostgreSQL과 인증 서버를 직접 올리는 방식이고, Supabase 자체가 오픈소스라서 통째로 자체 호스팅하는 것도 가능하다.
데이터 주권이나 규제 요구가 있거나 이미 서버 운영 체계를 갖춘 팀에는 이쪽이 정답이지만, 고정비와 백업·패치·모니터링이라는 운영 부담이 따라온다.
"완전 무료, 관리 최소화"라는 이 앱의 요구와는 정반대 방향이다.

### Supabase의 전부를 쓰지 않는다

Supabase는 Postgres와 Auth 외에도 많은 것을 준다.
테이블에서 REST API를 자동 생성하는 PostgREST, WebSocket 기반 실시간 구독인 Realtime, 파일 저장소인 Storage, Deno 기반 Edge Functions까지 제공한다.
Echo Flip은 이 중 Postgres와 Auth만 쓴다.

PostgREST를 쓰지 않는 이유는 데이터 접근 규칙이 단순 CRUD가 아니기 때문이다.
간격 반복 계산이나 스마트 덱 조건 평가 같은 로직은 행 수준 보안(Row Level Security, RLS) 정책으로 표현하기에는 복잡하고, Go 코드로 두는 편이 테스트하기도 쉽다.
Realtime과 Storage는 요구사항에 없으니 배울 이유도 없다.

이 절제는 부수 효과로 벤더 종속을 줄여 준다.
supabase-js는 인증에만 쓰이고 데이터 계층은 표준 PostgreSQL 프로토콜로만 대화하므로, 훗날 Supabase를 떠나더라도 DB는 `DATABASE_URL`만 바꾸면 되고 인증은 JWT 발급자와 JWKS URL을 교체하면 검증 코드가 그대로 동작한다.
플랫폼이 주는 기능을 전부 써야 본전이라는 생각은 오히려 이식성을 갉아먹는다.
필요한 것만 골라 쓰는 실용주의가 이 선택의 핵심이다.

## 인증 아키텍처: 브라우저에서 Go까지

이제 로그인 버튼을 누른 순간부터 Go 핸들러가 사용자를 식별하기까지의 전체 흐름을 따라가 보자.
큰 그림은 다음과 같다.

```
브라우저(Next.js 정적 앱)         Supabase Auth            Go API(Vercel 함수)
    │ ① signInWithOAuth()             │                         │
    ├────────────────────────────────▶│                         │
    │   ② Google/GitHub 동의 화면 왕복  │                         │
    │◀────────────────────────────────┤                         │
    │ ③ /auth/callback 복귀,           │                         │
    │    supabase-js가 세션 저장        │                         │
    │ ④ Authorization: Bearer <JWT>   │                         │
    ├─────────────────────────────────────────────────────────▶│
    │                                 │ ⑤ JWKS 공개키로 서명 검증  │
    │◀─────────────────────────────────────────────────────────┤
```

주목할 점은 Go API가 ④와 ⑤에만 등장하고, 로그인 과정 자체(①~③)에는 우리 백엔드가 전혀 개입하지 않는다는 사실이다.
OAuth 앱 등록, 콜백 처리, 토큰 발급은 모두 Supabase Auth가 대신 수행하고, 우리 코드는 결과물인 토큰을 소비할 뿐이다.

### 브라우저 전용 Supabase 클라이언트

프런트엔드의 Supabase 접점은 `src/lib/supabase.ts` 한 파일이다.
Supabase와 대화할 클라이언트 객체를 만들어 돌려주는 함수 하나와, 로컬 모드 여부를 알리는 상수 하나가 전부다.

```ts
"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Local mode: without NEXT_PUBLIC_SUPABASE_URL the app runs sign-in free
// against a local server that ignores auth. Mirrors the Go server's rule.
export const localMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;

let client: SupabaseClient | null = null;

// Browser-only Supabase client, used exclusively for Google/GitHub OAuth and
// session/token management. All data goes through the Go API. Never called
// in local mode.
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
```

`localMode`는 Go 서버가 `DATABASE_URL`의 유무로 모드를 갈랐던 것과 짝을 이루어, `NEXT_PUBLIC_SUPABASE_URL`의 유무로 프런트엔드의 모드를 가른다.
로컬 모드에서는 아래의 `supabase()`가 아예 호출되지 않는다.

`supabase()`는 처음 호출될 때 한 번만 클라이언트를 만드는 지연 초기화 싱글턴이다.
주석이 이 장의 설계를 요약하고 있다.
이 클라이언트는 OAuth 로그인과 세션·토큰 관리에만 쓰이고, 모든 데이터는 Go API를 거친다.
supabase-js로 테이블을 직접 조회하는 코드는 이 저장소에 한 줄도 없다.

### 로그인의 시작: signInWithOAuth

로그인 페이지 `src/app/login/page.tsx`에서 버튼 클릭 처리 부분만 발췌한다.
Google이나 GitHub 버튼이 눌리면 돌아올 화면을 기억해 두고 OAuth 여정을 출발시키는 코드다.

```ts
const signIn = (provider: "google" | "github") => {
  if (next === "/") sessionStorage.removeItem(AUTH_NEXT_KEY);
  else sessionStorage.setItem(AUTH_NEXT_KEY, next);
  void supabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
};
```

`signInWithOAuth`를 호출하면 브라우저는 Supabase의 인가 엔드포인트로 이동하고, 거기서 다시 Google이나 GitHub의 동의 화면으로 넘어간다.
`redirectTo`는 모든 절차가 끝난 뒤 돌아올 우리 앱의 주소다.
이 주소는 Supabase 대시보드의 Redirect URL 목록에 미리 등록되어 있어야 하는데, 등록 절차는 저장소의 DEPLOY.md 3단계에 정리되어 있다.

로그인 전에 보던 화면으로 되돌려 보내기 위한 `next` 경로를 `sessionStorage`에 저장하는 부분도 눈여겨보자.
OAuth 왕복은 우리 앱을 완전히 떠났다가 돌아오는 여정이라서 리액트 컴포넌트의 메모리 상태가 모두 사라진다.
페이지를 넘어 살아남는 저장소가 필요해서 `sessionStorage`를 쓴 것이다.

### 돌아오는 길: 콜백 페이지와 열린 리다이렉트 방지

동의 화면을 통과한 브라우저는 `/auth/callback`으로 돌아온다.
`src/app/auth/callback/page.tsx`의 핵심부다.
로그인이 마무리되기를 기다렸다가 사용자를 원래 보던 화면으로 돌려보내는 코드다.

```ts
// supabase-js (detectSessionInUrl) exchanges the OAuth code automatically on
// load; this page just waits for the session and moves on.
export default function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      const next = safeNext(sessionStorage.getItem(AUTH_NEXT_KEY));
      sessionStorage.removeItem(AUTH_NEXT_KEY);
      router.replace(next);
    } else if (!loading) {
      const timeout = setTimeout(() => router.replace("/login"), 4000);
      return () => clearTimeout(timeout);
    }
  }, [session, loading, router]);
  // ... 대기 화면 렌더링
}
```

콜백 URL에 담겨 온 인증 정보를 세션으로 바꾸는 일은 supabase-js가 자동으로 처리한다.
클라이언트 생성 시 기본값인 `detectSessionInUrl` 옵션 덕분에, 페이지가 로드되면 라이브러리가 URL을 검사해 세션을 만들어 브라우저 저장소에 넣는다.
그래서 이 페이지는 세션이 나타나기를 기다렸다가 원래 가려던 곳으로 보내 주기만 한다.

저장해 둔 `next` 경로를 그대로 쓰지 않고 `safeNext`로 거르는 이유가 있다.
`src/lib/authNext.ts` 전체를 보자.
돌아갈 경로를 담아 두는 키 하나와, 그 경로가 안전한지 검사하는 함수 하나로 이루어진 파일이다.

```ts
// Where to land after sign-in, carried via sessionStorage because the OAuth
// round-trip leaves the app entirely.
export const AUTH_NEXT_KEY = "auth-next";

// Only same-app paths are honored so a crafted ?next= link can't bounce the
// visitor to another origin after sign-in.
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
```

`?next=` 파라미터에 외부 주소를 심은 링크를 뿌리면, 로그인 직후 사용자를 피싱 사이트로 튕겨 보내는 열린 리다이렉트(open redirect) 공격이 가능해진다.
`safeNext`는 `/`로 시작하는 같은 앱 내부 경로만 허용하되, `//evil.com`처럼 프로토콜 상대 URL로 위장하는 경우까지 걸러낸다.
두 줄짜리 함수지만 없으면 보안 구멍이 되는 코드다.

### 세션을 앱 전체에 공급하는 AuthProvider

로그인 상태는 여러 화면이 함께 쓰므로 11장에서 다룬 Context로 공급한다.
`src/components/AuthProvider.tsx`에서 상태 관리 부분을 발췌한다.
앱이 켜질 때 저장된 로그인 상태를 되살리고, 이후의 변화를 지켜보는 코드다.

```ts
useEffect(() => {
  if (localMode) return;
  const client = supabase();
  client.auth.getSession().then(({ data }) => {
    setSession(data.session);
    setLoading(false);
  });
  const { data: sub } = client.auth.onAuthStateChange((event, next) => {
    setSession(next);
    setLoading(false);
    if (event === "SIGNED_OUT") queryClient.clear();
  });
  return () => sub.subscription.unsubscribe();
}, [queryClient]);
```

첫 줄의 `localMode` 가드는 로컬 모드에서 이 구독 전체를 건너뛰게 한다.
그 경우에는 고정 스텁 세션이 초기값으로 들어가 앱이 늘 로그인 상태로 동작하는데, 그 구조는 11장에서 봤다.
`getSession`으로 저장된 세션을 복원하고, `onAuthStateChange`로 로그인·로그아웃·토큰 갱신 이벤트를 구독한다.
로그아웃 시 TanStack Query 캐시를 비우는 한 줄은 실제 버그를 겪고 넣은 방어다.
공유 덱 API처럼 로그인 여부에 따라 응답이 달라지는 엔드포인트의 캐시가 이전 사용자 기준으로 남아 있으면, 다음 사용자에게 남의 개인화 정보가 보일 수 있다.

같은 파일의 `signOut`은 서버 쪽 토큰 폐기가 실패하면 `signOut({ scope: "local" })`로 폴백해 로컬 세션만이라도 지운다.
네트워크가 어떻든 사용자가 "로그아웃했는데 로그인 상태"인 화면을 보지 않게 하려는 것이다.

같은 파일의 `RequireAuth`는 세션이 없으면 `/login`으로 돌려보내는 클라이언트 측 가드로, 서버 측 리다이렉트가 없는 정적 export 앱에서 보호가 필요한 화면을 감싼다.
물론 진짜 보호는 백엔드의 토큰 검증이 담당하고, 이 가드는 사용자 경험을 위한 안내일 뿐이다.

### API 호출에 토큰 싣기

이제 ④ 단계, 토큰을 Go API에 전달하는 부분이다.
`src/lib/api.ts`에서 헤더를 만드는 함수를 보자.

```ts
// Sends the bearer token only when signed in — for endpoints that work
// anonymously but personalize the response for logged-in callers.
async function optionalAuthHeader(): Promise<Record<string, string>> {
  if (localMode) return {}; // the local-mode server ignores auth headers
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authHeader(): Promise<Record<string, string>> {
  const header = await optionalAuthHeader();
  if (!localMode && !header.Authorization)
    throw new ApiError(401, "로그인이 필요합니다");
  return header;
}
```

세션의 액세스 토큰을 꺼내 `Authorization: Bearer <토큰>` 헤더에 싣는 것이 전부다.
로컬 모드에서는 헤더를 아예 싣지 않는데, 서버 쪽 `LocalMiddleware`가 어차피 헤더를 보지 않으므로 양쪽의 규칙이 짝을 이룬다.
토큰을 변수에 캐시하지 않고 호출할 때마다 `getSession`을 부르는 이유는, 수명이 기본 1시간인 액세스 토큰을 supabase-js가 리프레시 토큰으로 자동 갱신해 주므로 매번 최신 토큰을 물어보는 쪽이 안전하기 때문이다.

### 무상태 구조가 주는 것

이 아키텍처의 특징을 한 문장으로 줄이면 "프런트엔드와 백엔드가 세션 저장소를 공유하지 않는다"이다.

로그인한 사용자를 알아보는 방식은 크게 둘로 나뉜다.
서버가 방문자 명부를 들고 손님에게는 번호표만 쥐여 주는 세션 방식과, 손님이 신분증을 직접 들고 다니는 JWT 방식이다.
전통적인 세션 방식(서버가 세션을 메모리나 Redis에 두고 쿠키로 세션 ID만 주고받는 방식)은 상주 서버에서는 검증이 빠르고 즉시 폐기가 가능한 좋은 선택이다.
그러나 서버리스에서는 함수 인스턴스가 수시로 생기고 사라지므로 인스턴스 메모리에 세션을 둘 수 없고, Redis를 붙이면 관리 플랫폼이 하나 늘어난다.

JWT 방식은 서명된 토큰 자체가 신원 증명이라서, 어떤 인스턴스가 요청을 받아도 공개키만 있으면 외부 저장소 조회 없이 사용자를 식별한다.
무상태(stateless)라서 수평 확장에 제약이 없고, 콜드스타트 때 세션 저장소 연결을 기다릴 필요도 없다.

::: info [용어 풀이] 무상태(Stateless)
서버가 이전 요청을 따로 기억해 두지 않고, 한 요청을 처리하는 데 필요한 정보가 그 요청 안에 모두 담겨 오는 구조다.
매번 신분증을 지참하고 오는 손님과 같아서, 창구 직원이 누구로 바뀌어도 그 자리에서 바로 응대할 수 있다.
그래서 서버리스 인스턴스가 수시로 생기고 사라져도, 아무 인스턴스나 요청을 받아 처리할 수 있다.
:::

대가도 정직하게 짚어야 하는데, 발급된 토큰은 만료 전까지 유효해서 즉시 강제 폐기가 어렵다.
Supabase는 액세스 토큰 수명을 1시간으로 짧게 잡고 리프레시 토큰 폐기로 갱신을 끊는 방식으로 이 약점을 완화한다.
탈취 즉시 차단이 필요한 금융 서비스 수준의 요구라면 세션 방식이나 토큰 블랙리스트를 검토해야 하지만, 이 앱에서는 1시간이 수용 가능한 창이다.

## Go에서의 JWT 검증

⑤ 단계, Go가 토큰을 검증하는 코드를 파헤쳐 보자.
JWT(JSON Web Token)를 일상어로 옮기면, 소지자가 누구이고 언제까지 유효한지를 적고 위조를 막는 서명을 붙인 디지털 출입증이다.
기술적으로는 헤더·페이로드·서명 세 부분을 점으로 이은 문자열이고, 페이로드에는 사용자 ID(`sub`), 만료 시각(`exp`) 같은 클레임(claim)이 들어 있다.
검증의 핵심은 "이 토큰을 정말 Supabase가 발급했는가"를 서명으로 확인하는 것이다.

### JWKS: 공개키를 내려받아 서명을 확인한다

Supabase는 서명을 만드는 열쇠와 확인하는 열쇠가 서로 다른 비대칭 키로 토큰에 서명하고, 그중 확인용 열쇠인 공개키(public key) 목록을 JWKS(JSON Web Key Set)라는 표준 형식으로 공개한다.
주소는 `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`이다.

::: info [용어 풀이] JWKS와 서명 검증
발급자가 개인키로 토큰에 찍은 서명이 진짜인지 확인하도록, 대조에 쓸 공개키를 묶어 공개한 목록이 JWKS(JSON Web Key Set)다.
인감과 인감증명서에 빗댈 수 있다.
인감은 주인만 찍을 수 있지만, 인감증명서(공개키)를 가진 사람은 누구나 그 도장이 진짜인지 대조할 수 있다.
즉 토큰은 발급자만 만들 수 있고, 진위 확인은 공개키만 있으면 누구나 할 수 있다.
:::

`internal/auth/jwt.go`에서 검증 키를 준비하는 부분을 보자.
토큰의 서명을 대조할 때 쓸 열쇠를 어디서 가져올지 정하는 함수다.

```go
func keyfuncFor(jwksURL, secret string) (jwt.Keyfunc, error) {
	if secret != "" {
		return func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrTokenSignatureInvalid
			}
			return []byte(secret), nil
		}, nil
	}
	jwksOnce.Do(func() {
		jwks, jwksErr = keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
	})
	if jwksErr != nil {
		return nil, jwksErr
	}
	return jwks.Keyfunc, nil
}
```

기본 경로는 아래쪽 JWKS 분기다.
`github.com/MicahParks/keyfunc` 라이브러리가 JWKS 문서를 내려받아 캐시하고 주기적으로 갱신하며, 토큰 헤더의 키 ID(`kid`)에 맞는 공개키를 골라 준다.
패키지 전역 변수 `jwks`를 `sync.Once`로 한 번만 초기화하는 것은 17장에서 본 서버리스 함수의 생명주기 때문이다.
웜 인스턴스는 여러 요청을 처리하므로, JWKS 클라이언트를 재사용하면 첫 요청 이후에는 네트워크 조회 없이 검증할 수 있다.

위쪽 분기는 공유 시크릿(HS256) 폴백이다.
`internal/config/config.go`에는 Go API가 읽어 들이는 설정값이 구조체 하나에 모여 있는데, 그 필드 주석이 이 폴백의 용도를 밝히고 있다.

```go
type Config struct {
	Driver         string // "postgres" (production) or "sqlite" (local mode)
	DatabaseURL    string
	SQLitePath     string
	AuthMode       string // "supabase" (JWT validation) or "local" (fixed user)
	JWKSURL        string
	JWTSecret      string // legacy HS256 fallback; used when set
	AllowedOrigins []string
	Port           string
}
```

JWKS 엔드포인트가 없는 구형 Supabase 프로젝트는 대칭 키(HS256)로 서명하므로, 그런 환경에서는 `SUPABASE_JWT_SECRET`을 설정해 이 분기를 탄다.
이때 서명 방식이 HMAC인지 명시적으로 확인하는 부분이 중요하다.
공격자가 공개키를 HMAC 시크릿인 척 쓰도록 헤더의 `alg`를 바꿔치기하는 알고리즘 혼동(algorithm confusion) 공격을 차단하는 코드다.

### 왜 공유 시크릿이 아닌가

HS256과 JWKS 중 무엇이 좋은지는 "검증자가 몇 명인가"로 갈린다.

HS256은 서명과 검증에 같은 시크릿을 쓴다.
검증하는 쪽도 시크릿을 가져야 하므로, Go 함수에 시크릿을 환경 변수로 배포해야 하고, 그 시크릿이 유출되면 누구든 유효한 토큰을 위조할 수 있다.
시크릿을 교체(회전)하려면 발급자와 모든 검증자를 동시에 업데이트해야 한다.

JWKS 기반 비대칭 서명은 이 문제를 구조적으로 없앤다.
첫째, 개인키는 Supabase만 보유하고 검증자는 공개키만 쓰므로, 검증자 쪽에서 무엇이 유출되어도 토큰을 위조할 수 없다.
둘째, 배포할 비밀 자체가 없다.
JWKS URL은 공개 정보라서 환경 변수에 비밀이 하나 줄어든다.
셋째, 키 회전(key rotation)이 매끄럽다.
JWKS 문서에 새 키를 추가하고 옛 키를 제거하는 것만으로 회전이 끝나고, 검증자는 캐시를 갱신하며 자동으로 따라간다.

물론 발급자와 검증자가 같은 프로세스이거나 외부 네트워크 조회를 피해야 하는 폐쇄 환경이라면 대칭 키가 단순해서 낫다.
Echo Flip처럼 발급자(Supabase)와 검증자(Go 함수)가 서로 다른 조직의 인프라에 있는 구성에서는 JWKS가 명백히 유리하다.

### 클레임 검증과 사용자 식별

서명이 유효해도 클레임 검증을 건너뛰면 안 된다.
`internal/auth/jwt.go`의 파싱 함수로, 토큰 안의 클레임을 검사한 뒤 사용자 ID를 꺼내 돌려준다.

```go
// parseUserID validates a Supabase access token and returns its subject.
func parseUserID(raw string, kf jwt.Keyfunc) (uuid.UUID, error) {
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(raw, claims, kf,
		jwt.WithValidMethods([]string{"HS256", "RS256", "ES256"}),
		jwt.WithAudience("authenticated"),
		jwt.WithExpirationRequired(),
	); err != nil {
		return uuid.Nil, err
	}
	sub, _ := claims["sub"].(string)
	return uuid.Parse(sub)
}
```

옵션 세 개가 각각 한 가지 공격 경로를 막는다.
`WithValidMethods`는 허용 알고리즘을 화이트리스트로 고정해 `alg: none` 같은 우회를 차단한다.
`WithAudience("authenticated")`는 Supabase가 로그인 사용자에게 발급한 토큰만 받는다는 뜻으로, 익명 토큰이나 다른 용도의 토큰을 거른다.
`WithExpirationRequired`는 `exp` 클레임이 아예 없는, 영원히 유효한 토큰을 거부한다.

검증을 통과하면 `sub` 클레임이 사용자 식별자다.
이 값은 Supabase `auth.users` 테이블의 UUID이고, 3장에서 설계한 `profiles.id`가 이 값을 그대로 쓴다.
인증 시스템의 사용자와 우리 스키마의 사용자가 같은 키로 이어지는 접점이다.

### 필수 인증과 선택 인증

이 파일은 두 가지 미들웨어를 내보낸다.
`Middleware`는 토큰이 없거나 무효하면 401로 요청을 끊고, `OptionalMiddleware`는 유효한 토큰이 있을 때만 사용자 ID를 붙이되 없어도 통과시킨다.
둘 다 방금 본 검증 경로를 그대로 거치며, 차이는 검증에 실패한 요청을 어떻게 처리하느냐뿐이다.
두 미들웨어가 라우터 조립에서 갈라지는 곳과 그 이유(공유 덱의 "익명 허용 + 로그인 시 개인화" 요구, 그리고 `Cache-Control: no-store`가 한 세트인 사연)는 7장에서 다뤘다.

## 정리

첫째, Supabase를 고른 이유는 관리형 PostgreSQL과 OAuth 인증을 무료 티어 하나로 해결하기 때문이다.
관리할 플랫폼을 늘리지 않으면서 인증을 직접 만들 때 떠안게 되는 비밀번호 저장, 이메일 검증, 세션 관리, OAuth 왕복 구현을 통째로 위임했다.

둘째, Supabase의 전부를 쓰지는 않았다.
PostgREST·Realtime·Storage를 쓰지 않고 Postgres와 Auth만 골라 쓴 절제가 벤더 종속을 줄였다.
supabase-js는 브라우저의 인증에만 쓰이고, 데이터 계층은 표준 PostgreSQL 프로토콜로만 대화한다.

셋째, 인증은 브라우저와 서버가 역할을 나눈다.
브라우저의 supabase-js가 OAuth 왕복과 세션 갱신을 전담하고, Go API는 요청마다 딸려 온 JWT의 서명만 검증한다.
서버는 세션을 기억하지 않으므로 함수 인스턴스가 몇 개 뜨든, 언제 사라지든 상관없다.

넷째, 서명 검증은 JWKS 공개키로 한다.
공유 시크릿을 함수 환경 변수로 배포하고 회전할 때 겪는 부담이 없고, `aud`·`exp` 검증과 알고리즘 화이트리스트까지 갖춰야 검증이 완성된다는 것을 코드로 확인했다.

다음 19장에서는 같은 Supabase의 다른 얼굴, 즉 데이터베이스 연결을 다룬다.
함수 인스턴스가 여럿 뜨는 서버리스 환경에서 커넥션이 폭증하는 문제를 트랜잭션 풀러로 푸는 방법, 그 대가로 pgx에 붙여야 하는 설정, 그리고 마이그레이션만은 직접 연결로 붙어야 하는 이유가 그 내용이다.
