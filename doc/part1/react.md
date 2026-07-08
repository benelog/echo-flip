# 4장 React와 Next.js로 만드는 화면

앞 장까지 언어 차원의 이야기를 했다면, 이 장에서는 Echo Flip의 화면이 실제로 어떻게 만들어지는지를 다룬다.
React를 선택한 이유와 대안의 트레이드오프를 먼저 짚고, Next.js의 정적 export 구성이 이 앱의 배포 전략과 어떻게 맞물리는지 살펴본다.
그다음 카드 뒤집기 컴포넌트, 학습 세션 상태 기계, 전역 인증 상태, 서버 상태 관리까지 실제 코드를 따라가며 React의 핵심 개념을 하나씩 익혀 보겠다.
TypeScript 문법은 3장에서 다뤘다고 전제하고, 배포 세부 구성은 8장으로 미룬다.

## 왜 React인가

프런트엔드 프레임워크 선택은 단순한 취향 문제가 아니라 앱의 수명 전체에 영향을 주는 결정이다.
Echo Flip이 React를 선택한 이유를 세 가지 관점에서 정리해 보자.

### 컴포넌트 기반 UI 모델

React의 첫 번째 축은 컴포넌트(component) 기반 UI 모델이다.
화면을 독립적인 조각으로 나누고, 각 조각을 입력(props)과 출력(렌더링 결과)이 명확한 함수로 만든다.

Echo Flip의 학습 화면을 예로 들면 구조가 이렇게 쌓인다.
`StudyView`가 진행률 바와 채점 버튼을 배치하고, 그 안에 카드 한 장을 그리는 `Flashcard`를 놓고, `Flashcard` 안에 발음 재생 버튼인 `TtsButton`을 놓는다.
각 컴포넌트는 자기 역할만 알면 되므로, 카드 디자인을 바꿀 때 세션 진행 로직을 건드릴 일이 없다.

### 선언적 렌더링

두 번째 축은 선언적(declarative) 렌더링이다.
jQuery 시절처럼 "정답이 공개되면 이 요소를 찾아서 클래스를 붙여라"라고 절차를 지시하는 대신, "상태가 이러하면 화면은 이렇게 생겼다"라고 결과만 선언한다.
`src/components/StudyView.tsx`의 실제 구조를 요약하면 이렇다.

```tsx
{state.revealed ? (
  <div className="grid grid-cols-2 gap-3">{/* 틀렸어요 / 맞았어요 버튼 */}</div>
) : (
  <button onClick={reveal}>정답 보기</button>
)}
```

`revealed`라는 상태 하나가 바뀌면 React가 알아서 이전 화면과 다음 화면의 차이를 계산해 DOM을 갱신한다.
개발자는 상태 전이만 설계하면 되고, 화면 동기화 버그가 끼어들 틈이 크게 줄어든다.

### 생태계, 그리고 AI 에이전트

세 번째 축은 압도적인 생태계다.
TanStack Query 같은 서버 상태 라이브러리, lucide-react 같은 아이콘 세트, Tailwind CSS 통합까지, 필요한 조각이 대부분 검증된 형태로 존재한다.

여기에 이 책의 2부와 이어지는 관점이 하나 더 있다.
AI 코딩 에이전트로 개발할 때, 학습 데이터에 React 코드가 압도적으로 많다는 사실이 실질적인 이점이 된다.
경험상 에이전트가 생성하는 React 코드는 관용구(idiom)를 잘 따르고 한 번에 동작하는 비율이 높은 반면, 소수 프레임워크에서는 미묘하게 낡은 API를 섞어 쓰는 일이 잦았다.
Echo Flip은 6장에서 다룰 Claude Code로 대부분의 화면을 작성했으므로, 이 점이 선택에 실제로 작용했다.

### 대안과 트레이드오프

물론 React가 항상 정답은 아니니 대안을 짚어 보자.

첫째, Vue는 템플릿 문법과 반응성(reactivity) 시스템 덕분에 진입 장벽이 낮고, 공식이 유지하는 라우터·상태 관리 도구가 잘 정돈되어 있다.
HTML에 가까운 템플릿을 선호하는 팀, 특히 백엔드 중심 팀이 화면을 얹는 경우라면 Vue가 더 매끄러울 수 있다.

둘째, Svelte는 컴파일 시점에 프레임워크 코드를 제거해 번들이 작고 런타임이 빠르다.
위젯 임베드처럼 전송 크기가 민감한 제품이라면 Svelte가 유리하다.
다만 생태계 규모와 AI 생성 코드 품질에서는 아직 React에 못 미친다.

셋째, SPA(Single Page Application) 프레임워크 없이 서버 렌더링 HTML로 가는 길도 있다.
Go 템플릿이나 Rails에 htmx 정도를 곁들이는 방식이다.
폼 제출과 목록 조회가 중심인 관리 도구라면 이쪽이 오히려 단순하고 빠르다.
그러나 Echo Flip의 핵심 화면은 카드 뒤집기, 라운드 반복, 진행률 갱신처럼 서버 왕복 없이 즉각 반응해야 하는 상호작용이므로, 클라이언트에 상태를 두는 SPA 모델이 자연스럽다.

정리하면, 상호작용이 많고 에이전트 협업을 전제하는 이 앱에서는 React의 생태계 이점이 학습 곡선 비용을 상회한다고 판단했다.

## 왜 Next.js이고 왜 정적 export인가

React는 뷰 라이브러리일 뿐, 라우팅과 빌드는 스스로 해결하지 않는다.
Echo Flip은 그 틀로 Next.js를 쓰되, 흔한 서버 렌더링 구성이 아니라 정적 export(static export)를 택했다.

### output: 'export' — 서버 없는 Next.js

`next.config.ts`부터 보자.

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

이 선택의 근거는 두 가지다.
첫째, Echo Flip의 API는 전부 Go/Gin 서버리스 함수가 담당하므로(2장 참고) Next.js 쪽에 Node 서버를 둘 이유가 없다.
둘째, 정적 파일만 서빙하면 Vercel 무료 요금제 안에서 CDN 배포가 끝나고, Node 서버 렌더링 함수를 함께 돌리는 것보다 비용·운영 부담이 확실히 가볍다.

트레이드오프도 명확하다.
SEO가 중요한 콘텐츠 사이트라면 요청 시점 서버 렌더링이나 ISR(Incremental Static Regeneration)이 필요하므로 정적 export가 부적합하다.
Echo Flip은 로그인 후 개인 데이터를 다루는 앱이라 검색 노출 요구가 거의 없고, 첫 화면이 빈 껍데기여도 문제가 없다.

### 정적 export의 제약과 우회

정적 export의 가장 큰 제약은 동적 라우트 세그먼트를 쓸 수 없다는 점이다.
`/decks/[slug]` 같은 경로는 빌드 시점에 모든 slug를 알아야 페이지를 미리 만들 수 있는데, 사용자가 만드는 덱의 slug를 빌드 때 알 방법이 없다.

Echo Flip은 이를 두 단계로 우회한다.
먼저 페이지 자체는 `/deck`이라는 고정 경로의 정적 페이지 하나로 만들고, 컴포넌트가 브라우저에서 URL을 읽어 어떤 덱을 보여줄지 결정한다.
그리고 `/decks/abcd` 같은 예쁜 URL은 Vercel의 rewrite로 그 정적 페이지에 연결한다.

`vercel.json`의 해당 부분이다.

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "/api/index" },
  { "source": "/decks/:slug", "destination": "/deck" },
  { "source": "/shared/:slug", "destination": "/shared-deck" },
  { "source": "/cards/:id", "destination": "/card" }
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

덱 상세처럼 경로에 식별자를 실을 수 없는 화면은 `/study?mode=due&deckId=...`처럼 쿼리 파라미터 라우팅으로 처리한다.
rewrite를 포함한 배포 구성 전체는 8장에서 자세히 다룬다.

## 컴포넌트와 JSX

이제 코드로 들어가서, Echo Flip에서 가장 상징적인 컴포넌트인 카드 뒤집기 UI, `src/components/Flashcard.tsx`를 중심 예제로 삼아 보자.

### 함수 컴포넌트와 props

React 컴포넌트는 props를 받아 JSX를 반환하는 함수다.
JSX(JavaScript XML)는 JavaScript 안에 HTML과 비슷한 마크업을 쓰는 문법 확장으로, 빌드 시 함수 호출로 변환된다.

`src/components/Flashcard.tsx`의 시그니처를 보자.

```tsx
export function Flashcard({
  card,
  direction,
  revealed,
  onReveal,
  ttsRate,
}: {
  card: Card;
  direction: StudyDirection;
  revealed: boolean;
  onReveal: () => void;
  ttsRate?: number;
}) {
  const textFirst = direction === "text_to_meaning";
  const questionText = textFirst ? card.text : card.meaning;
  const answerText = textFirst ? card.meaning : card.text;
  // ...생략...
}
```

`Flashcard`는 카드가 뒤집혔는지(`revealed`)를 스스로 기억하지 않는다.
상태는 부모가 소유하고, 이 컴포넌트는 값과 콜백(`onReveal`)만 받는다.
이런 컴포넌트를 제어 컴포넌트(controlled component)라 부르는데, 상태의 주인이 하나뿐이므로 "카드는 뒤집혔는데 채점 버튼은 안 나오는" 식의 불일치가 원천적으로 생기지 않는다.

같은 컴포넌트가 "영어 → 뜻"과 "뜻 → 영어" 두 학습 방향을 모두 소화하는 것도 눈여겨보자.
`direction` prop에서 파생한 `textFirst` 하나로 질문면과 정답면의 내용을 바꿔치기할 뿐, JSX 구조는 그대로다.

### 조건부 렌더링

JSX 안에서 조건부 렌더링은 `&&`와 삼항 연산자로 표현한다.
정답면 렌더링 부분을 발췌한다.

```tsx
<div className="flex flex-1 flex-col justify-center gap-3 py-4">
  <p className="whitespace-pre-line text-center text-lg font-medium leading-relaxed">
    {answerText}
  </p>
  {!textFirst && card.phonetic && (
    <p className="text-center text-sm text-neutral-500">{card.phonetic}</p>
  )}
  {card.example && (
    <p className="whitespace-pre-line text-center text-sm italic text-neutral-600 dark:text-neutral-300">
      {card.example}
    </p>
  )}
  {/* ...notes 생략... */}
</div>
```

`card.example && (...)`은 "예문이 있을 때만 이 단락을 그린다"라고 읽으면 된다.
발음 기호는 `!textFirst && card.phonetic`처럼 조건을 겹쳐, 뜻이 먼저 나오는 방향에서만 정답면에 표시한다.
영어가 질문면일 때는 발음 기호가 정답의 힌트가 되지 않도록 질문면에 이미 있기 때문이다.

한편 카드 뒤집기 애니메이션 자체는 React가 아니라 CSS가 담당한다.
`revealed`가 참이 되면 `flip-inner` 요소에 `flipped` 클래스가 붙고, `src/app/globals.css`에 정의된 3D transform 전환이 실행된다.
상태는 React가, 시각 효과는 CSS가 맡는 역할 분담이다.

## 상태와 훅

React 함수 컴포넌트는 훅(Hook)이라는 함수를 통해 상태와 생명주기에 접근하는데, Echo Flip에서 실제로 쓰인 순서대로 짚어 보겠다.

### useState — 가장 작은 상태

`useState`는 값 하나와 그 값을 바꾸는 함수를 돌려준다.
`src/app/decks/page.tsx`의 덱 생성 폼이 전형적인 예다.

```tsx
const [creating, setCreating] = useState(false);
const [name, setName] = useState("");
```

"새 덱" 버튼이 `setCreating(true)`를 호출하면 폼이 나타나고, 입력할 때마다 `setName`이 호출되어 입력값과 상태가 동기화된다.
setter를 호출해야만 React가 다시 렌더링한다는 점이 핵심으로, 변수를 직접 바꾸는 것으로는 화면이 갱신되지 않는다.

### useEffect — 외부 세계와의 접점

`useEffect`는 렌더링 결과를 화면에 반영한 뒤 실행할 부수 효과(side effect)를 등록한다.
브라우저 API 호출, 구독 등록처럼 React 바깥 세계와 만나는 코드가 여기 들어간다.

`src/components/Providers.tsx`에서는 서비스 워커 등록에 쓴다.

```tsx
useEffect(() => {
  if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}, []);
```

두 번째 인자인 의존성 배열이 `[]`이므로 첫 마운트 때 한 번만 실행된다.

구독을 등록하면 해제도 해야 한다.
`useEffect`가 반환하는 함수는 컴포넌트가 사라질 때 호출되는 정리(cleanup) 함수다.
뒤에서 볼 `AuthProvider`가 인증 이벤트 구독을 이 패턴으로 관리하고, `src/hooks/useTts.ts`도 `voiceschanged` 이벤트 리스너를 같은 방식으로 정리한다.

### useCallback, 그리고 쓰지 않은 useMemo

`useCallback`은 함수를 의존성이 바뀔 때만 새로 만들어, 자식에게 넘기는 콜백의 정체성을 안정시킨다.
`src/hooks/useTts.ts`의 `speak`가 실제 예다.

```tsx
const speak = useCallback(
  (text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel(); // Chrome queues otherwise
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    // ...생략...
    window.speechSynthesis.speak(utterance);
  },
  [rate],
);
```

의존성 배열 `[rate]` 덕분에 재생 속도가 바뀌지 않는 한 `speak`는 같은 함수 객체로 유지된다.

짝으로 언급되는 `useMemo`는 비싼 계산 결과를 캐시하는 훅인데, 솔직하게 말하면 Echo Flip 코드에는 한 번도 등장하지 않는다.
이 앱의 파생 값 계산은 카드 수십 장을 다루는 수준이라 매 렌더링마다 다시 계산해도 비용이 무시할 만하기 때문이다.
`useMemo`를 습관적으로 감싸는 것은 코드만 복잡하게 만드는 조기 최적화이니, 프로파일러로 병목을 확인한 뒤에 쓰는 도구로 남겨 두자.

### 커스텀 훅 1 — useStudySession, 학습 세션 상태 기계

훅의 진짜 힘은 로직을 커스텀 훅(custom hook)으로 묶어 재사용하는 데 있다.
Echo Flip의 학습 흐름은 "전부 맞힐 때까지 틀린 카드를 라운드로 반복"하는 규칙을 갖는데, 이 규칙 전체가 `src/hooks/useStudySession.ts` 하나에 들어 있다.

상태가 여덟 필드로 얽혀 있으므로 `useState` 여러 개 대신 `useReducer`로 상태 기계(state machine)를 만들었다.

```ts
export type StudyPhase = "studying" | "roundBreak" | "finished";

interface State {
  round: number;
  queue: Card[];
  index: number;
  revealed: boolean;
  missed: Card[];
  firstPassTotal: number;
  firstPassCorrect: number;
  phase: StudyPhase;
}

type Action =
  | { type: "reveal" }
  | { type: "grade"; correct: boolean }
  | { type: "nextRound" };
```

전이 규칙은 리듀서(reducer) 함수에 모이는데, 채점 액션의 처리를 보자.

```ts
case "grade": {
  const card = state.queue[state.index];
  const missed = action.correct ? state.missed : [...state.missed, card];
  const firstPassCorrect =
    state.round === 1 && action.correct
      ? state.firstPassCorrect + 1
      : state.firstPassCorrect;
  const index = state.index + 1;
  if (index < state.queue.length) {
    return { ...state, index, revealed: false, missed, firstPassCorrect };
  }
  // Round finished: retry missed cards until none remain.
  if (missed.length > 0) {
    return { ...state, index, missed, firstPassCorrect, phase: "roundBreak" };
  }
  return { ...state, index, missed, firstPassCorrect, phase: "finished" };
}
```

틀린 카드는 `missed`에 쌓이고, 라운드가 끝났을 때 `missed`가 남아 있으면 `roundBreak` 국면으로, 비어 있으면 `finished`로 전이한다.
1라운드 정답만 `firstPassCorrect`에 집계해 재도전이 정답률을 부풀리지 않게 한 것도 리듀서 안의 규칙이다.

이 설계의 장점은 순수 함수라는 데 있다.
리듀서는 React 없이도 호출할 수 있으므로, 7장에서 다룰 품질 게이트에서 상태 전이를 단위 테스트하기 쉽다.

훅 본체는 리듀서를 감싸고, 채점 시 서버 기록까지 함께 처리한다.

```ts
const grade = useCallback(
  (correct: boolean) => {
    const card = state.queue[state.index];
    if (!card || state.phase !== "studying") return;
    void recordReview(sessionId, card.id, correct, state.round > 1);
    // ...마지막 카드면 세션 종료 API 호출...
    dispatch({ type: "grade", correct });
  },
  [sessionId, state.queue, state.index, state.missed.length, state.phase, state.round],
);
```

`recordReview`는 실패해도 학습을 막지 않도록 한 번 재시도 후 조용히 포기한다.
암기 앱에서 채점 기록 하나보다 학습 흐름이 끊기지 않는 것이 더 중요하다는 판단이다.

사용하는 쪽인 `src/components/StudyView.tsx`는 이렇게 단순해진다.

```tsx
const { state, current, reveal, grade, startNextRound, quit } =
  useStudySession(sessionId, cards);
```

화면 컴포넌트는 `state.phase`에 따라 학습 화면, 라운드 안내, 완료 화면 중 하나를 그릴 뿐이다.

### 커스텀 훅 2 — useTts, 브라우저 API 감싸기

`src/hooks/useTts.ts`는 Web Speech API를 감싸는 커스텀 훅으로, 브라우저 API의 온갖 잔가시를 훅 안에 격리하는 패턴을 보여 준다.

```ts
export function useTts(rate = 0.9) {
  const [supported, setSupported] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  // ...speak 정의는 앞 절에서 보았다...
  return { speak, supported };
}
```

세 가지 잔가시가 처리되고 있다.
첫째, Chrome은 음성 목록을 비동기로 로드하므로 `voiceschanged` 이벤트를 구독해 `useRef`에 보관한다.
음성 목록은 화면에 그릴 값이 아니므로 `useState` 대신 렌더링을 유발하지 않는 `useRef`가 알맞다.
둘째, `typeof window === "undefined"` 검사로 빌드 시 사전 렌더링 환경에서의 오류를 막는다.
셋째, `supported` 플래그를 노출해 미지원 브라우저에서는 `TtsButton`이 아예 렌더링을 생략하게 한다(`if (!supported) return null;`).

이 훅을 쓰는 컴포넌트는 `const { speak, supported } = useTts(rate);` 한 줄이면 되고, Web Speech API를 다른 구현으로 교체해도 수정 범위는 이 파일 하나다.

## Context로 전역 인증 상태 공유하기

로그인 세션처럼 화면 곳곳에서 필요한 값을 props로 층층이 내려보내면, 중간 컴포넌트들이 자기와 무관한 값을 운반하는 프롭 드릴링(prop drilling)이 생긴다.
React의 Context는 이 문제를 풀기 위한 공식 통로다.

`src/components/AuthProvider.tsx`가 Echo Flip의 인증 Context다.

```tsx
const AuthContext = createContext<AuthState>(/* ...기본값 생략... */);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
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
`useEffect`의 반환값으로 구독을 해제하는 정리 함수 패턴이 여기서도 등장한다.

로그아웃 이벤트에서 `queryClient.clear()`를 호출하는 줄은 Context와 서버 상태 캐시의 접점이다.
공유 덱 API처럼 로그인 여부에 따라 응답이 달라지는 엔드포인트가 있어, 이전 사용자 기준으로 캐시된 데이터가 새 방문자에게 노출되지 않도록 캐시를 통째로 비운다.

꺼내 쓰는 쪽은 커스텀 훅으로 감싼다.

```tsx
export function useAuth() {
  return useContext(AuthContext);
}
```

이렇게 하면 사용처는 `const { session, signOut } = useAuth();`만 알면 되고, Context 객체 자체는 이 파일 밖으로 새지 않는다.

같은 파일의 `RequireAuth`는 Context를 활용한 클라이언트 측 인증 가드다.

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
물론 진짜 보안 경계는 Go API의 토큰 검증(2장)이고, 이 가드는 사용자 경험을 위한 장치일 뿐이다.

Context 값이 바뀌면 그 Context를 구독하는 모든 컴포넌트가 다시 렌더링된다는 점은 주의하자.
그래서 Context는 인증 세션, 테마처럼 자주 바뀌지 않는 전역 값에 적합하고, 매 타이핑마다 바뀌는 값을 넣으면 앱 전체가 들썩인다.
자주 바뀌는 서버 데이터는 다음 절의 도구에 맡기는 편이 낫다.

## 서버 상태와 TanStack Query

### 클라이언트 상태와 서버 상태는 다르다

지금까지 다룬 상태는 모두 클라이언트 상태였다.
"폼이 열려 있는가", "카드가 뒤집혔는가"처럼 브라우저가 진실의 원천(source of truth)인 값들이다.

반면 덱 목록, 오늘 복습할 카드 수 같은 값의 진실은 서버 데이터베이스에 있다.
이런 서버 상태(server state)는 성격이 완전히 다르다.
언제든 낡을 수 있고, 로딩과 오류라는 부수 상태가 따라붙고, 여러 화면이 같은 데이터를 공유하며, 다른 기기에서의 변경으로 무효화될 수 있다.

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
언마운트 후 setState를 막는 `cancelled` 플래그를 직접 관리해야 하고, 재시도·캐시·화면 간 데이터 공유·변경 후 목록 갱신은 전부 추가 구현이다.
대시보드와 덱 목록 화면이 같은 `/api/decks`를 각자 fetch하면 요청도 중복된다.
이 반복 코드를 앱의 모든 조회마다 쓰게 되는 것이 `useEffect + fetch` 방식의 실체다.

### useQuery — 선언적 데이터 조회

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

### useMutation과 캐시 무효화

조회가 `useQuery`라면 생성·수정·삭제는 `useMutation`이다.
`src/app/decks/page.tsx`의 덱 생성이다.

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

핵심은 `onSuccess`의 `invalidateQueries` 호출이다.
"덱이 생겼으니 `["decks"]` 키의 캐시는 이제 낡았다"라고 선언하면, 그 키를 구독 중인 모든 화면이 자동으로 다시 조회해 새 덱을 반영한다.
서버 응답을 목록 배열에 직접 끼워 넣는 수동 동기화보다 훨씬 견고하고, 서버가 정렬이나 파생 필드를 바꿔도 클라이언트 코드는 그대로다.

폼 쪽에서는 `createDeck.isPending`으로 버튼을 비활성화해 중복 제출을 막으니, 로딩 상태 관리조차 직접 만들 필요가 없다.

### 전역 설정 — Providers.tsx

QueryClient의 전역 설정은 `src/components/Providers.tsx`에 있다.

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
`useState`의 초기화 함수로 QueryClient를 만드는 것은 리렌더링마다 클라이언트(와 캐시)가 새로 생기는 사고를 막는 관용구다.

Provider가 `QueryClientProvider → AuthProvider → ToastProvider` 순으로 겹쳐 있는 것도 우연이 아니다.
`AuthProvider`가 로그아웃 시 `queryClient.clear()`를 호출하려면 QueryClient Context 안쪽에 있어야 한다.

### 응용 — 세션 생성을 useQuery로

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

### 'use client' 지시어

이 장의 코드 발췌 대부분이 `"use client"`로 시작한 것을 눈치챘을 것이다.
App Router에서 컴포넌트는 기본적으로 서버 컴포넌트(Server Component)이고, 파일 첫 줄에 `"use client"`를 선언해야 클라이언트 컴포넌트가 된다.
`useState`, `useEffect` 같은 훅과 `onClick` 같은 이벤트 핸들러는 클라이언트 컴포넌트에서만 쓸 수 있다.

그렇다면 정적 export 앱에 서버 컴포넌트가 무슨 의미인가 싶겠지만, 여기서 "서버"는 빌드 머신을 포함한다.
`layout.tsx`에는 `"use client"`가 없다.
훅도 이벤트도 없는 이 파일은 빌드 시점에 한 번 실행되어 HTML 골격이 되고, 그 결과가 정적 파일에 구워진다.
반면 상호작용이 있는 페이지와 컴포넌트는 전부 클라이언트 컴포넌트로 선언되어 브라우저에서 실행된다.

`src/app/study/page.tsx`의 마지막 부분에는 정적 export 특유의 관례가 하나 더 있다.

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
첫째, React는 컴포넌트 기반·선언적 렌더링 모델과 압도적 생태계 때문에 선택했다.
AI 에이전트가 생성하는 코드 품질까지 고려하면 생태계 규모는 실질적인 생산성 변수다.
다만 템플릿 친화적 팀에는 Vue가, 번들 크기가 민감한 제품에는 Svelte가, 폼 중심 앱에는 서버 렌더링 HTML이 더 나은 선택일 수 있다.

둘째, Next.js는 `output: "export"`로 정적 파일만 뽑아낸다.
API는 Go 함수가 담당하므로 Node 서버가 불필요하고, 대신 동적 라우트 제약을 쿼리 파라미터 라우팅과 vercel.json rewrite로 우회한다.

셋째, 컴포넌트는 상태를 밖에서 받는 제어 컴포넌트로 만들면 불일치가 사라진다.
`Flashcard`가 `revealed`와 `onReveal`만 받아 두 학습 방향을 소화하는 것이 그 예다.

넷째, 얽힌 상태는 `useReducer` 상태 기계로, 브라우저 API는 커스텀 훅으로 격리한다.
`useStudySession`과 `useTts`가 로직과 화면을 분리하는 실례다.
`useMemo` 같은 최적화 훅은 병목이 확인되기 전에는 쓰지 않는다.

다섯째, 자주 바뀌지 않는 전역 값은 Context로, 서버 데이터는 TanStack Query로 관리한다.
`queryKey` 기반 캐시와 `invalidateQueries` 무효화가 `useEffect + fetch` 반복 코드를 대체한다.

여섯째, App Router는 파일 구조가 URL이 되는 관례이고, `"use client"`가 빌드 시점 실행과 브라우저 실행의 경계를 긋는다.

다음 5장에서는 이 화면들이 읽고 쓰는 데이터의 뼈대, PostgreSQL 데이터베이스 설계로 내려간다.
