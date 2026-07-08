# 10장 Supabase — 인증과 데이터베이스

9장에서 정적 프런트엔드와 Go 서버리스 함수를 Vercel 한 곳에 배포하는 과정을 살펴봤다.
이번 장에서는 마지막 남은 조각인 사용자 인증과 데이터베이스를 Supabase로 해결하는 방법을 해부한다.
브라우저에서 OAuth 로그인으로 토큰을 얻고 Go API가 그 토큰을 검증하기까지의 전체 흐름, 서버리스 환경 특유의 DB 연결 문제와 연결 풀러, 리전 배치와 환경 변수 구성까지 실제 코드를 따라가며 짚어 보겠다.
그리고 왜 다른 대안이 아닌 Supabase였는지, Supabase의 어떤 기능을 일부러 쓰지 않았는지도 트레이드오프 관점에서 살펴본다.

## 왜 Supabase인가

도입 장에서 정한 Echo Flip의 비기능 요구사항을 다시 떠올려 보자.
완전 무료 인프라로 운영할 것, 그리고 관리해야 할 플랫폼 수를 최소화할 것.
기능 요구사항을 소화하려면 사용자별 덱과 카드, 학습 기록을 저장할 관계형 데이터베이스가 필요하고, "사용자별"이라는 말이 성립하려면 로그인이 필요하다.

Supabase는 이 두 가지를 한 서비스에서 해결한다.
관리형(managed) PostgreSQL과 OAuth 소셜 로그인을 포함한 인증(authentication) 서비스가 하나의 프로젝트, 하나의 무료 티어 안에 들어 있다.
집필 시점 기준으로 무료 티어는 데이터베이스 500MB와 월간 활성 사용자 5만 명 수준을 제공하는데, 개인용 암기 카드 앱에는 차고 넘치는 용량이고, 결과적으로 Echo Flip이 계정을 만들고 관리하는 외부 플랫폼은 Vercel과 Supabase 딱 두 개다.

1인 개발자에게 무료 티어는 단순한 비용 절감이 아니라, 실패해도 잃을 것이 없는 실험 환경을 뜻한다.
다만 무료에는 무료의 규칙이 따라붙는데, 구체적인 한도와 함정은 잠시 뒤 "무료 티어로 어디까지 갈 수 있는가" 절에서 따로 다룬다.

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

### 대안 비교 — 언제 다른 선택이 나은가

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
그러나 Firestore는 NoSQL 문서 저장소라서 6장에서 설계한 관계형 스키마 — 외래 키 제약, JOIN, 집계 쿼리 — 를 그대로 옮길 수 없다.
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

## 무료 티어로 어디까지 갈 수 있는가

"완전 무료로 운영한다"는 목표를 세웠다면, 무료 플랜이 주는 것과 그 대가로 요구하는 것을 정확히 알아야 한다.
한도를 모르고 쓰다가 어느 날 서비스가 멈추는 것도, 여유가 충분한데 미리 겁먹고 유료로 넘어가는 것도 똑같이 손해다.
이 절에서는 Supabase 무료 플랜의 한도와 함께, 1인 무료 운영에서 실제로 부딪히는 두 가지 함정 — 일시정지와 백업 — 을 정리한다.

### 무료 플랜에 포함되는 것

2026년 7월 기준, Supabase 요금 페이지(supabase.com/pricing)가 밝히는 무료 플랜의 주요 한도는 다음과 같다.

| 항목 | 무료 플랜 한도 (2026년 7월 기준) |
|---|---|
| 관리형 PostgreSQL | 데이터베이스 500MB (공유 CPU, 메모리 500MB) |
| Auth | 월간 활성 사용자(Monthly Active Users, MAU) 5만 명 |
| 파일 스토리지 | 1GB |
| 전송량(egress) | 5GB (CDN 캐시 전송량 5GB 별도) |
| 활성 프로젝트 수 | 2개 |

Echo Flip이 쓰는 것은 이 중 PostgreSQL과 Auth뿐이지만, 스토리지와 전송량 한도도 알아 두면 나중에 파일 업로드 기능을 붙일지 판단할 때 도움이 된다.
Edge Functions 호출 횟수처럼 이 표에 없는 항목의 한도나 최신 수치는 요금 페이지에서 직접 확인하자.
무료 티어의 한도는 서비스 정책에 따라 언제든 조정될 수 있는 값이다.

활성 프로젝트 2개라는 한도는 뜻밖의 지점에서 걸린다.
운영용과 개발용 프로젝트를 분리하면 그것만으로 한도가 차므로, 다음 앱을 시작할 때는 안 쓰는 프로젝트를 정리하거나 개발 환경을 Supabase CLI의 로컬 스택으로 대신해야 한다.

### 가장 현실적인 함정 — 미사용 프로젝트 일시정지

무료 운영에서 용량 한도보다 먼저 부딪히는 것은 일시정지(pause) 정책이다.
2026년 7월 기준, 무료 프로젝트는 7일 동안 활동이 적으면 자동으로 일시정지된다.
공식 문서 기준으로 지난 한 주간 하루 몇 건 수준의 데이터베이스 요청이 있으면 활성으로 간주되며, 일시정지 약 일주일 전에 경고 이메일이 온다.

일시정지되면 데이터와 설정은 보존되지만 프로젝트 전체가 응답을 멈춘다.
DB 연결도, Auth 로그인도, 그 위에 올라탄 API 호출도 전부 실패하므로 사용자 눈에는 앱이 죽은 것과 다름없다.
재개하려면 Supabase 대시보드에서 해당 프로젝트를 열고 복원(restore) 버튼을 눌러야 하는데, 자동으로 되살아나지 않고 복원에도 몇 분이 걸린다.
더 중요한 것은 기한이다.
일시정지 후 90일 안에만 대시보드에서 복원할 수 있고, 그 기한이 지나면 백업 파일을 내려받아 새 프로젝트로 옮기는 길만 남는다.

피하는 방법은 단순하다.
개발자 자신이 매일 쓰는 앱이라면 그 사용 자체가 활동이므로 아무것도 할 필요가 없다.
문제는 며칠씩 손을 놓는 시기인데, 이때는 주기적인 핑(ping)으로 활동을 만들어 주면 된다.
GitHub Actions의 스케줄 워크플로나 UptimeRobot 같은 무료 모니터링 서비스로, 로그인 없이 DB를 조회하는 공개 엔드포인트 — Echo Flip이라면 `/api/shared-decks` — 를 하루 몇 번 호출하는 식이다.
이때 핑 대상이 실제로 DB 쿼리를 일으켜야 한다는 점이 핵심이다.
정적 페이지나 DB를 건드리지 않는 헬스 체크만 두드리면 Vercel 함수는 깨어나도 Supabase 기준으로는 여전히 무활동이다.
근본적인 해결책은 유료 전환뿐으로, 유료 플랜의 프로젝트는 일시정지 대상이 아니다.

### 백업은 무료가 아니다

두 번째 함정은 백업이다.
2026년 7월 기준 무료 플랜에는 자동 백업이 포함되지 않고, Pro 플랜(월 25달러)부터 7일 보관 일일 백업이 제공된다.
실수로 `DELETE`를 잘못 날리거나 마이그레이션이 데이터를 망가뜨렸을 때, 무료 플랜에는 돌아갈 시점 자체가 없다는 뜻이다.

1인 개발자의 현실적인 대안은 `pg_dump`다.
"대안 비교" 절에서 언급했듯 Supabase의 DB는 표준 PostgreSQL이므로, 이 장 뒷부분 환경 변수 구성에서 다루는 직접 연결 문자열로 `pg_dump`를 실행하면 스키마와 데이터 전체가 파일 하나로 떨어진다.
큰 변경 전에 수동으로 한 번 뜨는 습관만으로도 최악의 사고는 막을 수 있고, GitHub Actions 스케줄로 자동화할 수도 있다.
다만 사용자 데이터가 담긴 덤프 파일을 공개 저장소에 올리는 실수는 백업 부재보다 큰 사고이니 저장 위치는 신중히 정하자.
이 백업 습관은 앞서 본 90일 복원 기한과도 이어진다.
외부에 내 손으로 뜬 백업이 있는 한, 플랫폼의 어떤 정책 변경도 데이터의 생사를 좌우하지 못한다.

### 언제 유료로 넘어가는가

유료 전환을 고민하게 되는 신호는 대체로 세 가지다.
데이터베이스가 500MB 한도에 다가갈 때, 자동 백업 없이는 불안할 만큼 데이터가 소중해졌을 때, 그리고 일시정지를 피하는 우회책이 번거로워질 만큼 실사용자가 생겼을 때다.
2026년 7월 기준 Pro 플랜은 월 25달러에 데이터베이스 8GB, MAU 10만 명, 7일 백업을 제공하고 일시정지가 없다.
세 신호 중 하나라도 켜졌다면 앱이 취미를 넘어섰다는 뜻이니, 이 시점의 월 25달러는 비용이 아니라 보험이다.

Echo Flip의 규모를 대입해 보면 여유는 압도적이다.
카드 한 장은 앞뒷면 텍스트 몇백 바이트짜리 행이라, 카드 1만 장을 만들어도 학습 기록까지 합쳐 수십 MB 수준으로 500MB 한도의 10%에도 미치지 못한다.
사용자 한 명의 MAU는 한도 5만 명의 0.002%이고, JSON 몇 KB짜리 API 응답으로는 월 5GB 전송량을 소진할 방법이 없다.
결국 이 앱이 무료 플랜에서 마주칠 현실적인 제약은 용량이 아니라, 며칠 앱을 열지 않았을 때 찾아오는 일시정지뿐이다.

## 인증 아키텍처 — 브라우저에서 Go까지

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

```ts
"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Browser-only Supabase client, used exclusively for Google/GitHub OAuth and
// session/token management. All data goes through the Go API.
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

처음 호출될 때 한 번만 클라이언트를 만드는 지연 초기화 싱글턴이다.
주석이 이 장의 설계를 요약하고 있다.
이 클라이언트는 OAuth 로그인과 세션·토큰 관리에만 쓰이고, 모든 데이터는 Go API를 거친다.
supabase-js로 테이블을 직접 조회하는 코드는 이 저장소에 한 줄도 없다.

### 로그인의 시작 — signInWithOAuth

로그인 페이지 `src/app/login/page.tsx`에서 버튼 클릭 처리 부분만 발췌한다.

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

### 돌아오는 길 — 콜백 페이지와 열린 리다이렉트 방지

동의 화면을 통과한 브라우저는 `/auth/callback`으로 돌아온다.
`src/app/auth/callback/page.tsx`의 핵심부다.

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

로그인 상태는 여러 화면이 함께 쓰므로 5장에서 다룬 Context로 공급한다.
`src/components/AuthProvider.tsx`에서 상태 관리 부분을 발췌한다.

```ts
useEffect(() => {
  const client = supabase();
  client.auth.getSession().then(({ data }) => {
    setSession(data.session);
    setLoading(false);
  });
  const { data: sub } = client.auth.onAuthStateChange((event, next) => {
    setSession(next);
    setLoading(false);
    // Cached responses may be personalized for the previous identity
    // (e.g. the isMine flag on public shared-deck endpoints).
    if (event === "SIGNED_OUT") queryClient.clear();
  });
  return () => sub.subscription.unsubscribe();
}, [queryClient]);
```

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
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authHeader(): Promise<Record<string, string>> {
  const header = await optionalAuthHeader();
  if (!header.Authorization) throw new ApiError(401, "로그인이 필요합니다");
  return header;
}
```

세션의 액세스 토큰을 꺼내 `Authorization: Bearer <토큰>` 헤더에 싣는 것이 전부다.
토큰을 변수에 캐시하지 않고 호출할 때마다 `getSession`을 부르는 이유는, 수명이 기본 1시간인 액세스 토큰을 supabase-js가 리프레시 토큰으로 자동 갱신해 주므로 매번 최신 토큰을 물어보는 쪽이 안전하기 때문이다.

### 무상태 구조가 주는 것

이 아키텍처의 특징을 한 문장으로 줄이면 "프런트엔드와 백엔드가 세션 저장소를 공유하지 않는다"이다.

전통적인 세션 방식 — 서버가 세션을 메모리나 Redis에 두고 쿠키로 세션 ID만 주고받는 방식 — 은 상주 서버에서는 검증이 빠르고 즉시 폐기가 가능한 좋은 선택이다.
그러나 서버리스에서는 함수 인스턴스가 수시로 생기고 사라지므로 인스턴스 메모리에 세션을 둘 수 없고, Redis를 붙이면 관리 플랫폼이 하나 늘어난다.

JWT 방식은 서명된 토큰 자체가 신원 증명이라서, 어떤 인스턴스가 요청을 받아도 공개키만 있으면 외부 저장소 조회 없이 사용자를 식별한다.
무상태(stateless)라서 수평 확장에 제약이 없고, 콜드 스타트 때 세션 저장소 연결을 기다릴 필요도 없다.

대가도 정직하게 짚어야 하는데, 발급된 토큰은 만료 전까지 유효해서 즉시 강제 폐기가 어렵다.
Supabase는 액세스 토큰 수명을 1시간으로 짧게 잡고 리프레시 토큰 폐기로 갱신을 끊는 방식으로 이 약점을 완화한다.
탈취 즉시 차단이 필요한 금융 서비스 수준의 요구라면 세션 방식이나 토큰 블랙리스트를 검토해야 하지만, 이 앱에서는 1시간이 수용 가능한 창이다.

## Go에서의 JWT 검증

⑤ 단계, Go가 토큰을 검증하는 코드를 파헤쳐 보자.
JWT(JSON Web Token)는 헤더·페이로드·서명 세 부분을 점으로 이은 문자열이고, 페이로드에는 사용자 ID(`sub`), 만료 시각(`exp`) 같은 클레임(claim)이 들어 있다.
검증의 핵심은 "이 토큰을 정말 Supabase가 발급했는가"를 서명으로 확인하는 것이다.

### JWKS — 공개키를 내려받아 서명을 확인한다

Supabase는 비대칭 키로 토큰에 서명하고, 검증에 필요한 공개키(public key) 목록을 JWKS(JSON Web Key Set)라는 표준 형식으로 공개한다.
주소는 `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`이다.
`internal/auth/jwt.go`에서 검증 키를 준비하는 부분을 보자.

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
패키지 전역 변수 `jwks`를 `sync.Once`로 한 번만 초기화하는 것은 9장에서 본 서버리스 함수의 생명주기 때문이다.
웜 인스턴스는 여러 요청을 처리하므로, JWKS 클라이언트를 재사용하면 첫 요청 이후에는 네트워크 조회 없이 검증할 수 있다.

위쪽 분기는 공유 시크릿(HS256) 폴백이다.
`internal/config/config.go`의 필드 주석이 용도를 밝히고 있다.

```go
type Config struct {
	DatabaseURL    string
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
`internal/auth/jwt.go`의 파싱 함수다.

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
이 값은 Supabase `auth.users` 테이블의 UUID이고, 6장에서 설계한 `profiles.id`가 이 값을 그대로 쓴다.
인증 시스템의 사용자와 우리 스키마의 사용자가 같은 키로 이어지는 접점이다.

### 필수 인증과 선택 인증

이 파일은 두 가지 미들웨어를 내보낸다.
`Middleware`는 토큰이 없거나 무효하면 401로 요청을 끊고, `OptionalMiddleware`는 유효한 토큰이 있을 때만 사용자 ID를 붙이되 없어도 통과시킨다.
`pkg/app/app.go`의 라우터 조립에서 두 미들웨어가 갈라지는 지점을 보자.

```go
// Public: browsing shared decks needs no login. Optional auth only lets a
// signed-in caller see the "is mine" flag on their own shared decks.
pub := r.Group("/api", auth.OptionalMiddleware(cfg.JWKSURL, cfg.JWTSecret), /* ... */)
{
	pub.GET("/shared-decks", h.ListSharedDecks)
	pub.GET("/shared-decks/:slug", h.GetSharedDeck)
}

api := r.Group("/api", auth.Middleware(cfg.JWKSURL, cfg.JWTSecret), h.EnsureProfile())
```

공유 덱 열람은 로그인 없이 가능해야 하지만, 로그인한 사용자에게는 "내 덱" 표시를 보여 주고 싶다.
선택 인증은 이런 "익명 허용 + 개인화" 요구를 위한 장치다.
응답이 `Authorization` 헤더에 따라 달라지므로 `Cache-Control: no-store`로 공유 캐시 오염을 막는 것까지가 한 세트다.

## DB 연결 — 서버리스와 커넥션 풀

인증 다음은 데이터베이스 연결이다.
겉보기에는 연결 문자열 하나 넘기는 단순한 일이지만, 서버리스 환경에서는 이 장에서 가장 함정이 많은 주제다.

### pgx를 고른 이유

`go.mod`에서 DB 관련 의존성을 확인하자.

```go
require (
	// ...
	github.com/golang-migrate/migrate/v4 v4.19.1
	github.com/jackc/pgx/v5 v5.10.0
)
```

Go에서 PostgreSQL에 접속하는 정석은 표준 `database/sql` 인터페이스에 드라이버를 꽂는 방식이고, 오랫동안 `lib/pq`가 그 자리를 지켰다.
그러나 `lib/pq`는 유지보수 모드로 전환되었고, 프로젝트 스스로 pgx로 갈아탈 것을 권한다.

pgx는 PostgreSQL 전용 드라이버로, 표준 인터페이스를 거치지 않는 자체 API를 제공한다.
Postgres의 타입과 프로토콜을 직접 다루므로 성능이 좋고, 커넥션 풀(`pgxpool`)이 내장되어 있으며, 무엇보다 쿼리 실행 모드를 세밀하게 제어할 수 있다.
마지막 특성이 잠시 뒤 결정적으로 중요해진다.

`database/sql` 인터페이스가 나은 경우도 분명히 있다.
DB 종류를 바꿀 가능성이 있거나 `sqlx` 같은 표준 인터페이스 기반 생태계를 활용하고 싶다면 그쪽이 맞다.
Echo Flip은 PostgreSQL 고정이므로 추상화 계층을 걷어내고 pgx 네이티브 API를 쓴다.

### 서버리스에서 커넥션이 폭증하는 문제

상주 서버에서는 프로세스가 하나, 풀이 하나이므로 풀 크기가 곧 커넥션 상한이다.
서버리스는 다르다.
동시 요청이 늘면 플랫폼이 함수 인스턴스를 여러 개 띄우고 인스턴스마다 자기만의 풀을 만들기 때문에, 총 커넥션 수는 "인스턴스 수 × 풀 크기"가 되고 인스턴스 수는 우리가 통제할 수 없는 변수다.

한편 PostgreSQL의 커넥션은 값비싼 자원이다.
연결마다 서버 쪽 프로세스가 하나씩 붙어 메모리를 소비하므로, 무료 티어의 작은 인스턴스가 감당하는 직접 연결은 수십 개 수준에 불과하다.
트래픽이 몰려 인스턴스가 불어나면 `max_connections`가 소진되고, DB는 멀쩡한데 연결이 안 되는 장애가 난다.

### 트랜잭션 풀러와 simple protocol

이 문제의 표준 해법이 연결 풀러(connection pooler)다.
Supabase는 Supavisor라는 풀러를 함께 제공한다.
클라이언트는 풀러에 연결하고, 풀러가 소수의 실제 Postgres 커넥션을 여러 클라이언트에게 나눠 쓰게 한다.

풀러의 트랜잭션 모드(포트 6543)는 트랜잭션 하나가 실행되는 동안만 실제 커넥션을 빌려주고, 끝나면 즉시 회수해 다른 클라이언트에게 준다.
함수 인스턴스가 아무리 늘어나도 실제 DB 커넥션은 소수로 유지되므로 서버리스와 궁합이 가장 좋다.

공짜는 아니다.
같은 클라이언트라도 트랜잭션마다 다른 실제 커넥션에 배정될 수 있으므로, 커넥션(세션)에 상태가 남는 기능은 쓸 수 없다.
대표적인 것이 준비된 구문(prepared statement)이다.
pgx는 기본적으로 확장 프로토콜(extended protocol)로 쿼리를 준비해 캐시하는데, 준비해 둔 커넥션과 다음 쿼리가 실행될 커넥션이 다르면 "prepared statement가 존재하지 않는다"는 오류가 난다.

이 모든 사정이 `internal/db/db.go`에 압축되어 있다.

```go
// Pool returns a process-wide pgx pool. On Vercel each warm function instance
// reuses it across invocations, so keep it small: Supabase's pooled port
// (Supavisor transaction mode) also rules out prepared statements, hence
// simple protocol.
func Pool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	poolOnce.Do(func() {
		cfg, err := pgxpool.ParseConfig(databaseURL)
		if err != nil {
			poolErr = fmt.Errorf("parse DATABASE_URL: %w", err)
			return
		}
		cfg.MaxConns = 4
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
		pool, poolErr = pgxpool.NewWithConfig(ctx, cfg)
	})
	return pool, poolErr
}
```

세 가지 결정이 담겨 있다.
첫째, `sync.Once`로 풀을 프로세스당 하나만 만들어 웜 인스턴스가 호출 간에 재사용한다 — JWKS 클라이언트와 같은 패턴이다.
둘째, `MaxConns = 4`로 풀을 작게 잡아 인스턴스가 늘어도 폭증의 기울기를 낮춘다.
셋째, `QueryExecModeSimpleProtocol`로 단순 프로토콜(simple protocol)을 강제해, 쿼리를 준비 단계 없이 한 번에 보내므로 트랜잭션 풀러에서도 안전하다.

단순 프로토콜에서 파라미터는 pgx가 안전하게 이스케이프한 텍스트로 쿼리에 인코딩되므로 SQL 주입 걱정은 없다.
대신 확장 프로토콜의 바이너리 인코딩과 구문 재사용 이점을 포기하는 것인데, 이 앱의 쿼리 규모에서는 측정조차 어려운 차이다.
풀러와의 호환성을 성능 미세 손실과 맞바꾼, 남는 장사다.

### 마이그레이션은 direct 연결로

그런데 6장에서 다룬 스키마 마이그레이션은 반대로 풀러를 거치면 안 된다.
`internal/db/migrate.go`의 주석이 이유를 밝힌다.

```go
// Migrate applies all pending migrations. It needs a direct (non transaction-
// pooled) connection because golang-migrate takes an advisory lock.
func Migrate(databaseURL string) error {
	// ...
}
```

golang-migrate는 여러 프로세스가 동시에 마이그레이션을 실행하는 사고를 막으려고 권고 잠금(advisory lock)을 잡는다.
권고 잠금은 세션에 묶이는 상태라서, 트랜잭션마다 커넥션이 바뀌는 트랜잭션 풀러에서는 잠금을 잡은 커넥션과 이후 작업 커넥션이 어긋나 오동작한다.
그래서 `cmd/migrate/main.go`는 별도의 연결 문자열을 우선 사용한다.

```go
func main() {
	url := os.Getenv("MIGRATE_DATABASE_URL")
	if url == "" {
		url = os.Getenv("DATABASE_URL")
	}
	// ...
}
```

`MIGRATE_DATABASE_URL`에는 직접 연결(포트 5432) 문자열을 넣는다.
마이그레이션은 배포할 때 한 번, 커넥션 하나로 끝나는 작업이라 직접 연결의 커넥션 부담이 문제되지 않는다.
정리하면 수시로 열리는 API 쿼리는 트랜잭션 풀러(6543), 가끔 실행되는 세션 상태 의존 작업은 직접 연결(5432)로 용도에 따라 포트가 갈린다.

## 리전 콜로케이션 — 함수와 DB를 같은 곳에

9장에서 본 `vercel.json`은 함수 리전을 고정하고 있다.

```json
{
  "regions": ["iad1"]
}
```

그리고 DEPLOY.md의 첫 단계는 Supabase 프로젝트를 만들 때 리전을 East US(North Virginia)로 선택하라고 지시하며, "서울 리전을 고르면 안 됩니다"라고 못박는다.
한국 사용자를 위한 앱인데 왜 서울이 아닐까.

핵심은 왕복 횟수의 비대칭이다.
사용자와 함수 사이는 요청당 한 번 왕복하지만, 함수와 DB 사이는 요청 하나를 처리하며 여러 번 왕복한다.
프로필 확인, 덱 조회, 카드 목록, 학습 기록 갱신처럼 쿼리가 이어지면 API 요청 하나에 DB 왕복이 서너 번은 보통이다.

서울과 버지니아 사이의 왕복 지연(round-trip latency)은 약 180ms다.
함수가 iad1에 있는데 DB가 서울이라면, DB 왕복 4번에 지연만 700ms가 넘게 쌓인다.
반대로 함수와 DB가 같은 리전이면 왕복당 1ms 수준이라 쿼리 횟수가 체감 지연에서 사실상 사라진다.
Vercel 무료 티어의 함수 리전 선택지가 제한적이어서 함수를 서울로 옮기는 길이 막혀 있으니, DB를 함수 곁으로 보내는 것이 남은 최선이다.

물론 사용자→함수 구간의 태평양 횡단 180ms는 남지만, 요청당 한 번뿐인 비용이고 정적 자산은 CDN 엣지가 사용자 가까이에서 응답하므로 첫 화면 로딩은 리전과 무관하게 빠르다.
쓰는 플랫폼이 서울 리전 함수를 지원한다면 함수와 DB를 모두 서울에 두는 것이 정답이다.
콜로케이션(colocation)의 원칙은 "함수를 어디에 두든, DB는 반드시 그 옆에"이다.

## RLS 전략 — 정책 0개로 잠근다

6장에서 설계한 RLS 전략이 이 장의 인증 구조와 어떻게 맞물리는지만 짧게 복기한다.

Supabase는 anon key만 있으면 PostgREST 자동 API로 테이블에 접근할 수 있는 구조인데, anon key는 프런트엔드 번들에 들어가는 공개 값이라 그대로 두면 Go API의 인증·인가 로직을 우회하는 뒷문이 열린다.
Echo Flip은 모든 테이블에 RLS를 켜되 정책을 하나도 만들지 않았다.
RLS가 켜진 테이블에서 정책이 없으면 모든 행 접근이 거부되므로, anon key로는 어떤 데이터도 읽거나 쓸 수 없다.

반면 Go API는 `DATABASE_URL`의 postgres 역할로 접속하고, 이 역할은 테이블 소유자라서 RLS의 적용을 받지 않는다.
결과적으로 데이터 접근 경로는 Go API 하나로 수렴하고, 누가 무엇을 볼 수 있는지는 전부 Go 코드의 `WHERE user_id = ...` 조건이 결정한다.
RLS를 접근 제어 규칙이 아니라 뒷문을 잠그는 자물쇠로 쓴 셈이다.

## 환경 변수 구성

마지막으로 이 모든 연결을 묶는 설정을 정리한다.
저장소 루트의 `.env.local.example`이 전체 목록이다.

```bash
# 웹 (Next.js) — .env.local로 복사해서 값 채우기
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# 로컬 개발: Go API 주소. 프로덕션(Vercel)에서는 빈 값(같은 오리진).
NEXT_PUBLIC_API_URL=http://localhost:8080

# Go API (셸에서 export 하거나 direnv 사용) — Vercel 환경변수에도 동일하게 등록
# DATABASE_URL: Supabase → Connect → Transaction pooler (port 6543) 연결 문자열
DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
# 로컬 개발에서만 필요 (Next dev 서버 → Go API CORS)
ALLOWED_ORIGINS=http://localhost:3000

# 마이그레이션 전용: Direct connection (port 5432) 또는 Session pooler 문자열
MIGRATE_DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### 프런트엔드 — NEXT_PUBLIC_ 접두사의 의미

Next.js에서 `NEXT_PUBLIC_` 접두사가 붙은 변수는 빌드 시점에 자바스크립트 번들 안에 문자열로 새겨진다.
즉 브라우저를 여는 누구나 볼 수 있는 공개 값이므로, 이 접두사 뒤에는 비밀을 절대 두면 안 된다.

anon key가 여기 있어도 괜찮은 이유는 두 겹이다.
첫째, Supabase 설계상 anon key는 공개를 전제한 식별자로, 인증 요청이 어느 프로젝트 것인지 구분하는 용도다.
둘째, 앞 절의 RLS 전략 덕분에 이 키로는 어차피 데이터에 접근할 수 없다.

`NEXT_PUBLIC_API_URL`은 로컬 개발에서만 값을 채운다.
프로덕션에서는 정적 페이지와 Go 함수가 같은 오리진에서 서비스되므로 빈 값으로 두고 상대 경로 `/api/...`를 호출한다.

### Go API — DATABASE_URL과 SUPABASE_JWKS_URL

Go 쪽 설정은 `internal/config/config.go`가 읽고 검증한다.

```go
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWKSURL:     os.Getenv("SUPABASE_JWKS_URL"),
		JWTSecret:   os.Getenv("SUPABASE_JWT_SECRET"),
		Port:        os.Getenv("PORT"),
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWKSURL == "" && cfg.JWTSecret == "" {
		return nil, fmt.Errorf("SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET is required")
	}
	// ...
```

필수 값이 빠졌으면 서버가 뜨는 시점에 즉시 실패해, 설정 오류를 첫 요청의 알 수 없는 500 오류가 아니라 명확한 메시지로 드러낸다.
JWKS URL과 JWT 시크릿 중 하나만 있으면 되는 조건은 앞서 본 HS256 폴백과 짝을 이룬다.

각 변수의 성격을 구분해 두자.
`DATABASE_URL`은 DB 비밀번호가 포함된 진짜 비밀로, 유출되면 데이터 전체가 넘어간다.
`NEXT_PUBLIC_` 접두사가 붙지 않았으므로 번들에 새겨지지 않고 서버 측(Vercel 함수 환경 변수)에만 존재한다.
`SUPABASE_JWKS_URL`은 공개키 주소라 비밀은 아니지만 프로젝트마다 달라서 설정으로 뺐다.
`ALLOWED_ORIGINS`는 로컬 개발 전용이다.
로컬에서는 Next 개발 서버(3000)와 Go 서버(8080)의 오리진이 달라 CORS 허용이 필요하지만, 프로덕션은 같은 오리진이라 이 변수 자체가 필요 없다.

### 시크릿 관리 주의점

시크릿이 저장소에 새는 사고를 막는 첫 방어선은 `.gitignore`다.

```txt
# env files (can opt-in for committing if needed)
.env*
!.env.local.example
```

`.env`로 시작하는 모든 파일을 무시하되 자리표시자만 담긴 예제 파일만 예외로 커밋한다.
예제 파일에는 `<password>`처럼 형태만 보여 주는 값을 두고, 실제 값은 로컬의 `.env.local`과 Vercel 대시보드의 환경 변수에만 존재하게 한다.

몇 가지 습관을 덧붙인다.
첫째, 새 변수를 추가할 때 예제 파일에도 반영해 두면 예제 파일이 곧 설정 문서가 된다.
둘째, 유출이 의심되면 즉시 회전한다 — Supabase 대시보드에서 DB 비밀번호를 재설정하면 기존 연결 문자열은 무효가 된다.
셋째, 로컬과 프로덕션의 값 차이를 기록해 둔다 — 이 저장소에서는 `.env.local.example`의 주석과 DEPLOY.md의 표가 그 역할을 한다.

## 정리

이 장에서는 Supabase가 Echo Flip의 인증과 데이터베이스를 어떻게 떠받치는지 해부했다.
관리형 Postgres와 OAuth 인증을 무료 티어 하나로 해결한다는 것이 선택의 이유였고, PostgREST·Realtime·Storage는 쓰지 않고 Postgres와 Auth만 골라 쓰는 절제가 벤더 종속을 줄였다.
인증은 브라우저의 supabase-js가 OAuth 왕복과 세션 관리를 전담하고, Go API는 JWKS 공개키로 JWT 서명만 검증하는 무상태 구조다.
공유 시크릿 배포와 키 회전 부담이 없는 JWKS 방식의 이점, `aud`·`exp`·알고리즘 화이트리스트 같은 클레임 검증의 세부도 실제 코드로 확인했다.
DB 연결에서는 서버리스의 커넥션 폭증 문제를 트랜잭션 풀러(6543)로 풀되, 그 대가로 pgx에 simple protocol을 설정해야 한다는 점, 반대로 권고 잠금을 쓰는 마이그레이션은 직접 연결(5432)이어야 한다는 점을 봤다.
함수와 DB를 같은 리전에 두는 콜로케이션, 정책 0개 RLS, `NEXT_PUBLIC_` 접두사를 경계로 한 시크릿 구분까지가 이 장의 나머지 조각이었다.

이것으로 책의 여정도 끝이다.
도입에서 영어 암기 카드 앱이라는 작은 요구사항에서 출발해, 1부에서는 Go와 Gin, TypeScript와 React·Next.js, 그리고 PostgreSQL 설계로 코드를 읽는 눈을 길렀다.
2부에서는 Claude Code와 품질 게이트로 만드는 과정을, Vercel과 Supabase로 운영하는 기반을 살펴봤다.
돌아보면 "완전 무료, 관리 최소화"라는 빡빡한 제약이 오히려 설계를 명확하게 만들었다.
정적 export, 서버리스 함수, 무상태 인증, 트랜잭션 풀러 같은 이 책의 굵직한 결정은 전부 그 제약에서 논리적으로 따라 나온 것이다.
기술 선택이란 유행을 좇는 일이 아니라 자신의 제약을 정직하게 적고 트레이드오프를 따져 보는 일이라는 것, 그것이 이 작은 앱이 보여 주고 싶었던 전부다.
이제 이 저장소를 출발점 삼아, 여러분 자신의 제약과 요구사항으로 다음 앱을 만들어 보자.
