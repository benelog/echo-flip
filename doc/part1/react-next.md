# 11장 React 실전과 Next.js: 전역 상태와 정적 export

10장이 컴포넌트라는 부품을 만드는 장이었다면, 이 장은 그 부품들이 Echo Flip이라는 하나의 앱으로 조립되는 층을 다룬다.
로그인 세션처럼 화면 전체가 공유하는 값은 Context로 흘려보내고, 서버에 원본이 있는 데이터는 TanStack Query에 맡기며, Next.js의 App Router가 화면들을 URL에 배치한 뒤 전체를 정적 파일로 구워 낸다.
React와 Next.js, 정적 export라는 배포 형태를 선택한 이유는 1장에서 정리했고, 배포 세부 구성은 17장으로 미룬다.

## Context로 전역 인증 상태 공유하기

로그인 세션처럼 화면 곳곳에서 필요한 값을 props로 층층이 내려보내면, 중간 컴포넌트들이 자기와 무관한 값을 운반하는 프롭 드릴링(prop drilling)이 생긴다.
React의 Context는 이 문제를 풀기 위한 공식 통로다.

::: info [용어 풀이] Context
화면 어디서나 꺼내 쓸 수 있는 공용 보관함이다.
props로 값을 한 단계씩 손에서 손으로 넘기는 대신, 한곳에 값을 두고 필요한 컴포넌트가 직접 꺼내 가게 한다.
건물 곳곳에 놓인 정수기와 비슷해서, 물을 각 방까지 나르지 않아도 어느 층에서든 받아 마실 수 있다.
그래서 로그인 세션이나 테마처럼 여러 화면이 함께 쓰는 값에 알맞다.
:::

`src/components/AuthProvider.tsx`가 Echo Flip의 인증 Context다.
로그인 세션의 변화를 한곳에서 지켜보다가, 바뀌면 하위 화면 전체에 알리는 코드다.

```tsx
const AuthContext = createContext<AuthState>(/* ...기본값 생략... */);

const localSession = localMode
  ? ({ user: { email: "local@localhost" } } as Session)
  : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(localSession);
  const [loading, setLoading] = useState(!localMode);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (localMode) return;
    const client = supabase();
    // ...초기 세션 로드 생략...
    const { data: sub } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);
  // ...signOut 정의 생략...
}
```

`createContext`로 통로를 만들고, `AuthProvider`가 Supabase의 인증 이벤트를 구독해 `session` 상태를 유지하며, Provider 하위의 어떤 컴포넌트든 값을 꺼내 쓸 수 있다.
10장에서 본 `useEffect`의 정리 함수 패턴이 여기서도 등장해, 반환값으로 구독을 해제한다.

`localMode`는 `src/lib/supabase.ts`가 내보내는 상수로, Supabase 환경 변수 없이 도는 1부의 로컬 모드인지 알려 준다.
로컬 모드에는 로그인이라는 개념 자체가 없으므로, 구독을 시작하는 대신 고정 스텁 세션(`localSession`)을 초기값으로 넣어 앱 전체가 이미 로그인된 상태로 동작하게 한다.
Context를 쓰는 쪽은 어느 모드인지 모른 채 같은 `session` 값을 읽는다.

로그아웃 이벤트에서 `queryClient.clear()`를 호출하는 줄은 Context와 서버 상태 캐시의 접점으로, 이전 사용자 기준으로 캐시된 데이터가 다음 방문자에게 노출되지 않게 한다.
왜 이 한 줄이 필요한지는 인증 흐름 전체를 다루는 18장에서 자세히 살펴본다.

꺼내 쓰는 쪽은 커스텀 훅으로 감싼다.

```tsx
export function useAuth() {
  return useContext(AuthContext);
}
```

이렇게 하면 사용처는 `const { session, signOut } = useAuth();`만 알면 되고, Context 객체 자체는 이 파일 밖으로 새지 않는다.

같은 파일의 `RequireAuth`는 Context를 활용한 클라이언트 측 인증 가드다.
로그인하지 않은 방문자를 로그인 화면으로 돌려보내는 문지기 컴포넌트인 셈이다.

```tsx
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) return /* ..."불러오는 중…" 표시 생략... */;
  return <>{children}</>;
}
```

서버 렌더링이 없는 정적 export 앱에서는 서버 미들웨어로 접근을 막을 수 없으므로, 이렇게 클라이언트에서 리다이렉트한다.
물론 진짜 보안 경계는 Go API의 토큰 검증(7장)이고, 이 가드는 사용자 경험을 위한 장치일 뿐이다.

::: info [용어 풀이] 클라이언트 라우팅
화면을 바꿀 때 서버에서 새 페이지를 통째로 내려받지 않고, 브라우저 안에서 주소와 화면만 바꿔 끼우는 방식이다.
페이지 전체가 깜빡이며 새로 뜨는 대신 필요한 부분만 갈아 끼우므로 전환이 빠르다.
위 `router.replace("/login")`처럼 코드로 주소를 바꾸는 것도 서버를 거치지 않고 브라우저가 처리한다.
:::

Context 값이 바뀌면 그 Context를 구독하는 모든 컴포넌트가 다시 렌더링된다는 점은 주의하자.
그래서 Context는 인증 세션, 테마처럼 자주 바뀌지 않는 전역 값에 적합하고, 매 타이핑마다 바뀌는 값을 넣으면 앱 전체가 들썩인다.
자주 바뀌는 서버 데이터는 다음 절의 도구에 맡기는 편이 낫다.

## 서버 상태와 TanStack Query

### 클라이언트 상태와 서버 상태는 다르다

10장에서 다룬 상태는 모두 클라이언트 상태였다.
"폼이 열려 있는가", "카드가 뒤집혔는가"처럼 브라우저가 진실의 원천(source of truth)인 값들이다.

반면 덱 목록, 오늘 복습할 카드 수 같은 값의 진실은 서버 데이터베이스에 있다.
이런 서버 상태(server state)는 성격이 완전히 다르다.
언제든 낡을 수 있고, 로딩과 오류라는 부수 상태가 따라붙고, 여러 화면이 같은 데이터를 공유하며, 다른 기기에서의 변경으로 무효화될 수 있다.

::: info [용어 풀이] 서버 상태와 캐시(TanStack Query)
서버 상태는 진짜 값이 내 브라우저가 아니라 멀리 있는 서버에 있는 데이터다.
덱 목록처럼 언제든 낡을 수 있고 여러 화면이 함께 보는 값이 여기 속한다.
캐시(cache)는 그렇게 받아온 데이터를 잠시 손 닿는 곳에 베껴 두어, 매번 서버에 다시 묻지 않아도 되게 하는 임시 저장소다.
TanStack Query는 이 받아오기와 임시 저장, 갱신을 대신 처리해 주는 라이브러리다.
:::

### useEffect + fetch로 직접 하면 생기는 일

TanStack Query 없이 `useEffect`와 `fetch`만으로 덱 목록을 가져온다면 대략 이런 코드가 된다(비교를 위한 가상의 예제다).

```tsx
// 이렇게 하지 않았다 — 비교용 예제
const [decks, setDecks] = useState<Deck[] | null>(null);
const [error, setError] = useState<Error | null>(null);

useEffect(() => {
  let cancelled = false;
  api<Deck[]>("/api/decks")
    .then((d) => !cancelled && setDecks(d))
    .catch((e) => !cancelled && setError(e));
  return () => { cancelled = true; };
}, []);
```

이 코드가 감당하는 것은 최초 로딩뿐이다.
사용자가 이미 다른 화면으로 떠난 뒤에 응답이 도착해 사라진 컴포넌트의 상태를 건드리는 일이 없도록, `cancelled` 플래그도 직접 관리해야 한다.
재시도·캐시·화면 간 데이터 공유·변경 후 목록 갱신은 전부 추가 구현이다.
대시보드와 덱 목록 화면이 같은 `/api/decks`를 각자 fetch하면 요청도 중복된다.
이 반복 코드를 앱의 모든 조회마다 쓰게 되는 것이 `useEffect + fetch` 방식의 실체다.

### useQuery: 선언적 데이터 조회

TanStack Query는 이 문제 전체를 "키가 붙은 캐시"라는 모델로 해결한다.
`src/app/page.tsx`의 대시보드가 데이터를 가져오는 부분이다.

```tsx
const { data: due } = useQuery({
  queryKey: ["due-count"],
  queryFn: () => api<{ count: number }>(`/api/due-count?dueBefore=...생략...`),
});
const { data: decks } = useQuery({
  queryKey: ["decks"],
  queryFn: () => api<Deck[]>("/api/decks"),
});
```

`queryKey`는 캐시의 주소다.
대시보드와 덱 목록 화면이 둘 다 `["decks"]` 키를 쓰므로, 캐시가 신선한 동안에는 요청이 한 번만 나가고 두 화면이 같은 데이터를 공유한다.
로딩·오류·재시도·중복 제거는 라이브러리가 처리하고, 컴포넌트는 `data`가 있으면 그리고 없으면 넘어가는 선언적 코드만 남는다.
10장의 목록 렌더링 예제에서 `decks?.map`의 물음표가 감당하던 "아직 도착하지 않은 데이터"가 바로 이 `data`다.

### useMutation과 캐시 무효화

조회가 `useQuery`라면 생성·수정·삭제는 `useMutation`이다.
`src/app/decks/page.tsx`의 덱 생성이다.
서버에 새 덱을 만들어 달라고 요청하고, 성공하면 덱 목록 캐시를 낡은 것으로 표시하는 코드다.

```tsx
const createDeck = useMutation({
  mutationFn: (deckName: string) =>
    api<Deck>("/api/decks", {
      method: "POST",
      body: JSON.stringify({ name: deckName }),
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["decks"] });
    setName("");
    setCreating(false);
  },
  onError: (e) => toast(e.message, "error"),
});
```

10장의 덱 생성 폼에서 "제출하면 서버에 요청이 간다"라고만 해 둔 `createDeck.mutate`의 실체가 이것이다.
핵심은 `onSuccess`의 `invalidateQueries` 호출이다.
캐시 무효화(invalidation)란 베껴 둔 데이터에 "이 사본은 낡았으니 다시 받아오라"는 딱지를 붙이는 일이다.
"덱이 생겼으니 `["decks"]` 키의 캐시는 이제 낡았다"라고 선언하면, 그 키를 구독 중인 모든 화면이 자동으로 다시 조회해 새 덱을 반영한다.
서버 응답을 목록 배열에 직접 끼워 넣는 수동 동기화보다 훨씬 견고하고, 서버가 정렬이나 파생 필드를 바꿔도 클라이언트 코드는 그대로다.

폼 쪽에서는 `createDeck.isPending`으로 버튼을 비활성화해 중복 제출을 막으니, 로딩 상태 관리조차 직접 만들 필요가 없다.

### 전역 설정: Providers.tsx

QueryClient의 전역 설정은 `src/components/Providers.tsx`에 있다.
캐시의 기본 규칙을 정한 뒤 앱 전체를 Provider들로 감싸는 코드다.

```tsx
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );
  // ...서비스 워커 등록 useEffect 생략...
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

`staleTime: 30_000`은 "받아온 데이터를 30초 동안은 신선한 것으로 간주한다"라는 뜻이다.
화면을 오가도 30초 안에는 재요청이 없어 서버리스 함수 호출 횟수를 아끼고, 30초가 지나면 화면 복귀 시 자동으로 갱신된다.
10장에서 말했듯 리렌더링 때는 컴포넌트 함수가 통째로 다시 실행되므로, 그냥 만들면 화면이 갱신될 때마다 캐시 창고가 새로 지어져 모아 둔 데이터가 사라진다.
`useState`의 초기화 함수로 QueryClient를 만드는 것은 이 사고를 막고 최초 한 번만 만들게 하는 관용구다.

Provider가 `QueryClientProvider → AuthProvider → ToastProvider` 순으로 겹쳐 있는 것도 우연이 아니다.
`AuthProvider`가 로그아웃 시 `queryClient.clear()`를 호출하려면 QueryClient Context 안쪽에 있어야 한다.

### 응용: 세션 생성을 useQuery로

`src/app/study/page.tsx`에는 교과서에 없는 응용이 하나 있는데, 학습 세션 생성은 POST 요청이지만 `useMutation`이 아니라 `useQuery`로 감쌌다.

```tsx
// POST creates a session row; the query cache (plus disabled refetching)
// keeps it to a single session per visit, StrictMode included.
const { data, error, isLoading } = useQuery<SessionStart>({
  queryKey: ["session-start", mode, deckId, params.get("rule"), direction],
  queryFn: () => api<SessionStart>("/api/sessions", { method: "POST", /* ...생략... */ }),
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  retry: 0,
  enabled: direction !== null && (mode !== "due" || profile !== undefined),
});
```

React 18의 StrictMode는 개발 모드에서 이펙트를 두 번 실행하므로, `useEffect`에서 POST를 보내면 세션이 두 개 생긴다.
같은 `queryKey`에 대한 요청을 하나로 합쳐 주는 쿼리 캐시의 성질을 이용해 "방문당 세션 하나"를 보장한 것이다.
`enabled` 옵션은 사용자가 학습 방향을 고르기 전까지 쿼리를 잠들게 하는 스위치 역할을 한다.

트레이드오프 관점에서 한마디 보태자.
TanStack Query는 의존성 하나와 학습 비용을 추가하지만, 조회 화면이 서너 개만 넘어가도 직접 구현한 fetch 코드의 총량을 넘어서는 값을 한다.
반대로 화면이 한두 개뿐인 앱이나 데이터가 거의 정적인 앱이라면 `fetch` 한 줄이면 충분하고, 라이브러리가 과잉일 수 있다.

## App Router 구조

이제 이 컴포넌트들이 어떤 틀 위에 놓이는지 보자.
Next.js App Router는 `src/app` 디렉터리의 파일 구조가 곧 URL 구조가 되는 파일 기반 라우팅이다.

### layout.tsx와 page.tsx 관례

디렉터리 경로가 URL 경로가 되고, 그 안의 `page.tsx`가 해당 경로의 화면, `layout.tsx`가 하위 경로들이 공유하는 껍데기다.
Echo Flip의 구조를 보면 `src/app/page.tsx`가 `/`(대시보드), `src/app/decks/page.tsx`가 `/decks`, `src/app/study/page.tsx`가 `/study`에 대응한다.

루트 레이아웃인 `src/app/layout.tsx`는 모든 페이지를 감싼다.

```tsx
// ...metadata 정의 생략...
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`<body>` 바로 안쪽에서 `Providers`가 전체 트리를 감싸므로, 어떤 페이지에서든 쿼리 캐시와 인증 Context를 쓸 수 있다.
생략한 `export const metadata`는 Next.js가 빌드 시점에 `<head>`의 title, meta 태그로 변환해 주는 관례다.

### manifest.ts: 파일 하나로 PWA

App Router의 파일 관례는 화면에만 적용되는 것이 아니다.
`src/app/manifest.ts`를 두면 Next.js가 웹 앱 매니페스트(Web App Manifest)를 만들어 모든 페이지의 `<head>`에 연결해 준다.

::: info [용어 풀이] 웹 앱 매니페스트(Web App Manifest)
웹 페이지를 스마트폰에 앱처럼 설치할 수 있게 해 주는 설정 파일이다.
앱 이름, 아이콘, 시작 주소, 실행 방식 같은 정보를 담는다.
브라우저는 이 파일을 읽고서 '홈 화면에 추가'를 제안하고, 설치하면 아이콘과 독립 실행형 화면을 갖춘 앱처럼 띄운다.
:::

`src/app/manifest.ts`에서 앱 이름과 실행 방식을 정하는 부분을 발췌한다.

```ts
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Echo Flip — 암기 카드",
    short_name: "Echo Flip",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    // ...색상·아이콘 생략...
  };
}
```

도입에서 소개한 PWA 요구사항의 절반이 이 파일 하나로 충족된다.
`display: "standalone"` 덕분에 Android Chrome에서 "홈 화면에 추가"를 누르면 주소창 없는 독립 실행형 앱처럼 동작하고, iOS Safari에서도 같은 방식으로 설치할 수 있다.
반환 타입이 `MetadataRoute.Manifest`로 고정되어 있어 매니페스트 필드의 오타나 잘못된 값은 컴파일 시점에 걸린다.
나머지 절반인 서비스 워커(`public/sw.js`)와 각 필드가 실제 설치 경험에 주는 영향은 20장에서 따로 다룬다.
맨 위의 `export const dynamic = "force-static"`은 이 파일을 빌드 시점에 정적 생성하라는 선언으로, 바로 이어서 볼 정적 export 구성과 한 몸이다.

### 서버 없는 Next.js를 만드는 output: 'export'

Echo Flip은 Next.js를 흔한 서버 렌더링 구성이 아니라 정적 export(static export)로 쓴다.
이 배포 형태를 택한 이유는 1장에서 정리했으니, 여기서는 구성 방법만 짚는다.

::: info [용어 풀이] 정적 export(정적 사이트 생성)
화면을 미리 다 그려서 HTML·CSS·JS 파일 묶음으로 구워 내는 것이다.
방문자가 올 때마다 서버가 페이지를 만들어 주는 대신, 완성된 파일을 그대로 내려보낸다.
식당에 비유하면 주문받고 조리하는 대신 도시락을 미리 싸 두는 셈이라, 서버를 상시 켜 둘 필요가 없어 운영이 단순하고 비용이 낮다.
:::

정적 export를 켜는 스위치는 `next.config.ts`에 있다.
이 파일부터 보자.

```ts
import type { NextConfig } from "next";

// Static export: the frontend deploys as pure static files on Vercel while
// /api/* is served by the Go function (see vercel.json rewrites).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: { root: __dirname },
};
```

`output: "export"`를 지정하면 `next build`가 Node.js 서버용 산출물 대신 순수 HTML·CSS·JS 정적 파일을 만든다.
서버 컴포넌트의 서버 실행, 이미지 최적화 서버, API 라우트 같은 서버 기능은 포기하는 대신, 배포가 "파일 올리기"로 단순해진다.

### 정적 export의 제약과 우회

정적 export의 가장 큰 제약은 동적 라우트 세그먼트(dynamic route segment)를 쓸 수 없다는 점이다.
화면을 미리 다 구워 두는 방식이라, 주소의 일부가 사용자마다 달라지는 화면은 미리 만들어 둘 수 없다는 뜻이다.
`/decks/[slug]` 같은 경로가 그 예인데, 여기서 slug는 덱마다 붙는 고유한 주소 문자열이다.
페이지를 미리 만들려면 빌드 시점에 모든 slug를 알아야 하는데, 사용자가 앞으로 만들 덱의 slug를 빌드 때 알 방법이 없다.

Echo Flip은 이를 두 단계로 우회한다.
먼저 페이지 자체는 `/deck`이라는 고정 경로의 정적 페이지 하나로 만들고, 컴포넌트가 브라우저에서 URL을 읽어 어떤 덱을 보여줄지 결정한다.
그리고 `/decks/abcd` 같은 예쁜 URL은 Vercel의 rewrite로 그 정적 페이지에 연결한다.

`vercel.json`의 해당 부분이다.
덱마다 달라지는 주소를 미리 구워 둔 정적 페이지에 이어 주는 연결 규칙 목록이다.

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "/api/index" },
  { "source": "/decks/:slug", "destination": "/deck" },
  { "source": "/shared/:slug", "destination": "/shared-deck" },
  { "source": "/cards/:id", "destination": "/card" },
  { "source": "/decks/:slug/cards/new", "destination": "/card" }
]
```

한 가지 함정이 있는데, 정적 export 모드에서는 `next.config.ts`의 rewrites 설정이 프로덕션 빌드에 반영되지 않는다.
그래서 개발 서버에서만 같은 매핑을 흉내 내도록 조건부로 넣어 두었다.

`next.config.ts`의 이어지는 부분이다.

```ts
// Static export ignores rewrites — in production Vercel maps these pretty URLs
// to their static pages (vercel.json); next dev needs the same mapping.
if (process.env.NODE_ENV === "development") {
  nextConfig.rewrites = async () => [
    { source: "/decks/:slug", destination: "/deck" },
    { source: "/shared/:slug", destination: "/shared-deck" },
    // ...생략...
  ];
}
```

덱 상세처럼 경로에 식별자를 실을 수 없는 화면은 `/study?mode=due&deckId=...`처럼 주소 뒤에 물음표로 이름=값 짝을 이어 붙이는 쿼리 파라미터 라우팅으로 처리한다.
rewrite를 포함한 배포 구성 전체는 17장에서 자세히 다룬다.

### 'use client' 지시어

10장과 이 장에서 발췌한 컴포넌트 파일은 대부분 첫 줄이 `"use client"`다.
App Router에서 컴포넌트는 기본적으로 서버 컴포넌트(Server Component)이고, 파일 첫 줄에 `"use client"`를 선언해야 클라이언트 컴포넌트가 된다.
`useState`, `useEffect` 같은 훅과 `onClick` 같은 이벤트 핸들러는 클라이언트 컴포넌트에서만 쓸 수 있다.

그렇다면 정적 export 앱에 서버 컴포넌트가 무슨 의미인가 싶겠지만, 여기서 "서버"는 빌드 머신을 포함한다.
`layout.tsx`에는 `"use client"`가 없다.
훅도 이벤트도 없는 이 파일은 빌드 시점에 한 번 실행되어 HTML 골격이 되고, 그 결과가 정적 파일에 구워진다.
반면 상호작용이 있는 페이지와 컴포넌트는 전부 클라이언트 컴포넌트로 선언되어 브라우저에서 실행된다.

`src/app/study/page.tsx`의 마지막 부분에는 정적 export 특유의 관례가 하나 더 있다.
학습 화면을 `Suspense`라는 울타리로 감싸서 내보내는 코드다.

```tsx
export default function StudyPage() {
  return (
    <AppShell>
      <Suspense>
        <Study />
      </Suspense>
    </AppShell>
  );
}
```

`useSearchParams`로 쿼리 파라미터를 읽는 컴포넌트는 `Suspense` 경계로 감싸야 한다.
빌드 시점의 사전 렌더링 단계에는 쿼리 파라미터가 존재하지 않으므로, 그 부분만 나중에 브라우저에서 채우겠다고 표시하는 것이다.

## Tailwind CSS

마지막으로 스타일링을 짧게 짚어 보자.
Echo Flip은 Tailwind CSS의 유틸리티 클래스(utility class) 방식을 쓴다.
CSS 파일에 클래스를 정의하고 이름을 짓는 대신, 미리 정의된 원자적 클래스를 마크업에 직접 나열하는 방식이다.

`src/components/StudyView.tsx`의 채점 버튼을 보자.

```tsx
<button
  onClick={() => grade(true)}
  className="flex items-center justify-center gap-2 rounded-xl bg-green-600 py-4 font-semibold text-white active:scale-[0.98]"
>
  <Check size={20} /> 맞았어요
</button>
```

`flex`, `rounded-xl`, `bg-green-600` 같은 클래스가 각각 CSS 선언 한두 줄에 대응한다.
`active:scale-[0.98]`은 누르는 순간 살짝 줄어드는 터치 피드백으로, 상태 변형(variant)도 클래스 접두사로 표현된다.
앞서 `layout.tsx`의 body에서 본 `dark:bg-neutral-950`처럼 다크 모드 대응도 `dark:` 접두사가 붙은 클래스를 나란히 선언하는 방식이다.

className이 길어지는 것이 단점처럼 보이지만, 스타일이 마크업 옆에 있어 컴포넌트 파일 하나만 보면 구조와 모양을 모두 파악할 수 있다.
클래스 이름 짓기와 CSS 파일 왕복이 사라지는 이점은 수정 대상이 파일 하나로 좁혀진다는 점에서 AI 에이전트와의 협업에서도 유효하다.
다만 카드 뒤집기의 3D 변환처럼 유틸리티로 표현하기 번거로운 스타일은 `src/app/globals.css`에 일반 CSS로 두었다.
도구를 교리로 만들지 않고 적재적소에 섞어 쓰면 된다.

## 정리

이 장에서 살펴본 내용을 요약해 보자.

첫째, 자주 바뀌지 않는 전역 값은 Context로 공유한다.
`AuthProvider`가 인증 이벤트를 구독해 세션을 유지하고, `RequireAuth`가 클라이언트 측 인증 가드를 세운다.
Context 값이 바뀌면 구독하는 모든 컴포넌트가 리렌더링되므로, 자주 바뀌는 서버 데이터는 여기에 넣지 않는다.

둘째, 서버 상태는 TanStack Query로 관리한다.
`queryKey` 기반 캐시와 `invalidateQueries` 무효화가 `useEffect + fetch` 반복 코드를 대체하고, 여러 화면이 같은 데이터를 공유한다.

셋째, App Router는 파일 구조가 URL이 되는 관례다.
`layout.tsx`가 공용 껍데기와 Provider 조립을 맡고, `manifest.ts` 파일 하나가 PWA 설치 요구사항을 감당한다.

넷째, Next.js는 `output: "export"`로 정적 파일만 뽑아내고, 동적 라우트 제약은 쿼리 파라미터 라우팅과 vercel.json rewrite로 우회한다.
`"use client"`가 빌드 시점 실행과 브라우저 실행의 경계를 긋는다.

다섯째, 스타일은 Tailwind 유틸리티 클래스를 기본으로 하되, 표현이 번거로운 곳은 일반 CSS와 섞어 쓴다.

여기까지 데이터베이스라는 바닥에서 출발해 Go와 Gin으로 API를 올리고, TypeScript와 React로 사용자가 만지는 화면까지 한 층씩 쌓아 올렸다.

다음 12장부터는 지금까지 읽은 이 코드를 실제로 만들어 낸 AI 에이전트인 Claude Code를 살펴본다.
