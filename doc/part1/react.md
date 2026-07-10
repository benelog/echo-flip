# 10장 React 기초: 컴포넌트, 상태, 훅

앞 장까지 언어 차원의 이야기를 했다면, 이제 Echo Flip의 화면이 실제로 어떻게 만들어지는지를 볼 차례다.
React를 선택한 이유와 대안의 트레이드오프는 1장에서 정리했다.
이 장에서는 React의 핵심 개념인 컴포넌트와 props, 상태와 훅을 카드 뒤집기 컴포넌트와 학습 세션 상태 기계 같은 실제 코드로 하나씩 익혀 보겠다.
TypeScript 문법은 8장과 9장에서 다뤘다고 전제한다.
컴포넌트들을 하나의 앱으로 조립하는 Context와 서버 상태 관리, Next.js의 라우팅과 정적 export는 다음 11장에서 다룬다.

## React는 화면을 어떻게 그리는가

코드로 들어가기 전에, React가 풀려는 문제부터 짚고 가자.
웹 화면의 실체는 DOM이라는 트리 구조다.
브라우저는 서버에서 받은 HTML을 읽어 이 트리를 만들고, 화면은 그 트리를 그린 결과이며, 화면을 바꾼다는 것은 곧 이 트리를 고치는 일이다.

::: info [용어 풀이] DOM(Document Object Model)
브라우저가 웹 페이지를 프로그램이 다룰 수 있도록 펼쳐 놓은 부품 트리다.
HTML 문서의 제목, 단락, 버튼 하나하나가 트리의 마디가 되고, JavaScript는 이 마디를 찾아 내용을 바꾸거나 새 마디를 붙일 수 있다.
화면에 보이는 모든 변화는 결국 DOM이 바뀐 결과다.
:::

React 이전의 전형적인 방식은 JavaScript로 DOM을 직접 고치는 것이었다.
"카드가 뒤집히면 정답 요소를 찾아서 보이게 하고, 채점 버튼 두 개를 붙이고, 안내 문구를 지운다"처럼 바꾸는 절차를 하나하나 지시한다.
화면이 단순할 때는 문제가 없지만, 상태 하나가 화면 여러 곳에 영향을 주기 시작하면 갱신 코드가 사방에 흩어지고, 하나만 빠뜨려도 상태와 화면이 어긋난다.
"지금 화면이 어떤 상태인가"를 코드 어디에서도 한눈에 알 수 없게 되는 것이 이 방식의 한계다.

React의 접근은 반대다.
개발자는 "상태가 이럴 때 화면은 이렇게 생겼다"라는 결과만 선언하고, 상태가 바뀌면 React가 새 결과를 계산해 이전과 달라진 부분만 실제 DOM에 반영한다.
바꾸는 절차는 React의 몫이 되고, 개발자의 코드에는 상태와 화면의 대응 관계만 남는다.
이 장에서 볼 코드가 전부 "무엇을 그린다"만 말하고 "어떻게 고친다"를 말하지 않는 이유다.

## 컴포넌트와 JSX

이제 코드로 들어가서, Echo Flip에서 가장 상징적인 컴포넌트인 카드 뒤집기 UI, `src/components/Flashcard.tsx`를 중심 예제로 삼아 보자.
이 컴포넌트가 화면에 그려 내는 결과물은 다음 두 장이다.
앞으로 볼 코드가 무엇을 만드는지 먼저 눈에 담아 두면 읽기가 한결 수월하다.

<div class="ef-shots">

![왼쪽은 카드 앞면으로 질문만 보이고, 오른쪽은 뒤집은 뒷면으로 정답과 판정 버튼이 나타난다](/screenshots/flashcard-pair.png)

</div>

<p class="ef-caption">그림 5 <code>Flashcard</code> 컴포넌트가 그리는 앞면과 뒷면. 같은 컴포넌트가 <code>revealed</code> 값에 따라 두 얼굴을 보여 준다.</p>

### 함수 컴포넌트와 props

React 컴포넌트는 props를 받아 JSX를 반환하는 함수다.
JSX(JavaScript XML)는 JavaScript 안에 HTML과 비슷한 마크업을 쓰는 문법 확장으로, 빌드 시 함수 호출로 변환된다.

::: info [용어 풀이] 컴포넌트(Component)와 props
컴포넌트는 화면을 이루는 조각 하나다.
버튼, 카드, 목록처럼 화면의 일부를 그리는 작은 단위이고, 이런 조각들을 쌓아 한 화면을 만든다.
props는 그 조각에 밖에서 건네주는 재료다.
같은 카드 컴포넌트라도 어떤 단어를 담을지, 뒤집혔는지 같은 재료를 props로 바꿔 주면 다른 모습이 된다.
:::

`src/components/Flashcard.tsx`의 시그니처를 보자.
이 컴포넌트가 밖에서 받는 재료의 목록, 즉 어떤 카드를 어느 방향으로 보여 주고 뒤집혔는지를 선언하는 부분이다.

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

::: info [용어 풀이] 상태(state)
화면이 지금 기억하고 있는 것이다.
카드가 뒤집혔는지, 폼이 열려 있는지처럼 시간에 따라 변하면서 화면 모습을 좌우하는 값을 가리킨다.
이 값이 바뀌면 React가 화면을 그 값에 맞춰 다시 그린다.
그래서 '무엇을 기억하고 누가 그 기억의 주인인가'가 컴포넌트 설계의 핵심이 된다.
:::

같은 컴포넌트가 "영어 → 뜻"과 "뜻 → 영어" 두 학습 방향을 모두 소화하는 것도 눈여겨보자.
`direction` prop에서 파생한 `textFirst` 하나로 질문면과 정답면의 내용을 바꿔치기할 뿐, JSX 구조는 그대로다.

### 조건부 렌더링

JSX 안에서 조건부 렌더링은 `&&`와 삼항 연산자로 표현한다.
정답면 렌더링 부분을 발췌한다.
정답 텍스트를 그린 뒤, 발음 기호와 예문을 있을 때만 골라 덧붙이는 코드다.

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

### 목록 렌더링과 key

조건이 "그릴까 말까"라면, 목록은 "몇 개를 그릴까"다.
JSX에서 목록은 별도 문법 없이 배열의 `map`으로 그린다.
`src/app/decks/page.tsx`에서 덱 배열을 화면의 목록으로 바꾸는 부분이다.

```tsx
{decks?.map((deck) => (
  <Link key={deck.id} href={`/decks/${deck.slug}`} className="...생략...">
    <span className="font-medium">{deck.name}</span>
    <span className="text-sm text-neutral-500">{deck.cardCount}장</span>
  </Link>
))}
{decks?.length === 0 && !creating && (
  <p className="py-8 text-center text-sm text-neutral-500">
    아직 덱이 없어요. 첫 덱을 만들어보세요!
  </p>
)}
```

JSX의 중괄호 안에는 어떤 JavaScript 표현식이든 들어갈 수 있으므로, "덱 배열을 `<Link>` 요소 배열로 변환한다"는 `map` 한 번이면 목록이 된다.
`decks?.`의 물음표는 8장에서 본 옵셔널 체이닝으로, 서버에서 덱 목록이 아직 도착하지 않아 `undefined`일 때를 건너뛴다(이 데이터를 받아오는 쪽은 11장에서 다룬다).
빈 배열일 때 안내 문구를 보여 주는 마지막 부분은 방금 본 조건부 렌더링이다.

하나 낯선 것은 `key`라는 prop이다.
React는 리렌더링 때 이전 목록과 새 목록을 비교해 달라진 항목만 DOM에 반영하는데, 항목이 중간에 추가되거나 삭제되면 "몇 번째"라는 위치만으로는 어느 항목이 어느 항목인지 짝지을 수 없다.
`key`는 그 짝짓기에 쓰는 이름표로, 순서가 바뀌어도 변하지 않는 고유값(여기서는 덱의 `id`)을 줘야 한다.
배열 인덱스를 key로 쓰면 항목이 끼어들 때 이름표가 통째로 밀리므로, 목록이 변하는 화면에서는 피하는 것이 관례다.

## 상태와 훅

React 함수 컴포넌트는 훅(Hook)이라는 함수를 통해 상태와 생명주기에 접근하는데, Echo Flip에서 실제로 쓰인 순서대로 짚어 보겠다.

::: info [용어 풀이] React 훅(Hook)
컴포넌트가 상태를 기억하거나 바깥 세계와 연결되도록 도와주는 특별한 함수다.
이름이 `use`로 시작하는 것이 관례이고, 바로 이어 볼 `useState`·`useEffect`가 대표적이다.
컴포넌트라는 조각에 기억력이나 감각 같은 기능을 끼워 넣는 부품이라고 보면 된다.
이름은 같지만 13장에 나오는 Claude Code의 훅과는 다른 것이다.
:::

### useState: 가장 작은 상태

`useState`는 값 하나와 그 값을 바꾸는 함수를 돌려준다.
`src/app/decks/page.tsx`의 덱 생성 폼이 전형적인 예다.
폼이 열려 있는지와 입력 중인 덱 이름, 두 가지 기억을 선언하는 코드다.

```tsx
const [creating, setCreating] = useState(false);
const [name, setName] = useState("");
```

여기서 React 용어 하나를 짚고 가자.
상태 값에 맞춰 화면을 그리는 일을 렌더링(rendering), 값이 바뀌어 화면을 다시 그리는 일을 리렌더링(re-rendering)이라 부른다.
setter를 호출해야만 React가 리렌더링한다는 점이 핵심으로, 변수를 직접 바꾸는 것으로는 화면이 갱신되지 않는다.

### 이벤트와 제어 입력: 상태를 바꾸는 손잡이

그렇다면 setter는 언제 불리는가.
대부분은 사용자의 행동, 즉 이벤트다.
JSX에서는 `onClick`, `onChange`처럼 `on`으로 시작하는 prop에 함수를 건네 이벤트에 반응한다.
같은 파일의 "새 덱" 버튼과 이어지는 생성 폼을 보자.
버튼이 폼을 열고, 입력이 상태를 갱신하고, 제출이 브라우저의 기본 동작 대신 앱의 로직을 실행하는 코드다.

```tsx
<button onClick={() => setCreating(true)} className="...생략...">
  <Plus size={16} /> 새 덱
</button>

{creating && (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      if (name.trim()) createDeck.mutate(name.trim());
    }}
  >
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder="덱 이름 (예: 토익 필수 단어)"
    />
    <button type="submit" disabled={createDeck.isPending}>만들기</button>
  </form>
)}
```

세 가지 관례가 보인다.

첫째, 이벤트 핸들러에는 함수 자체를 넘긴다.
`onClick={() => setCreating(true)}`는 "클릭되면 이 함수를 불러 달라"는 등록이지, 지금 호출하는 것이 아니다.

둘째, `onSubmit`의 `e.preventDefault()`는 폼을 제출하면 페이지 전체를 새로 고치는 브라우저의 기본 동작을 취소한다.
화면 전환 없이 JavaScript로 제출을 처리하는 앱에서는 정해진 첫 줄에 가깝다.

셋째, `input`의 `value={name}`과 `onChange`의 조합이다.
입력창에 보이는 값의 주인도 React 상태여서, 타이핑할 때마다 `setName`이 상태를 갱신하고 그 상태가 다시 입력창에 그려진다.
앞서 본 제어 컴포넌트와 같은 원리를 입력 요소에 적용한 것으로, 제어 입력(controlled input)이라 부른다.
덕분에 입력 검증이나 초기화가 전부 "상태를 다루는 일"로 통일된다.
폼을 닫을 때 `setName("")` 한 줄이면 입력창도 함께 비워진다.

`createDeck.mutate(...)`는 서버에 덱 생성을 요청하는 부분인데, 서버와의 대화는 11장의 주제이므로 지금은 "제출하면 서버에 요청이 간다" 정도로만 읽고 넘어가자.

### useEffect: 외부 세계와의 접점

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

두 번째 인자인 의존성 배열이 `[]`이므로 컴포넌트가 화면에 처음 붙을 때(마운트) 한 번만 실행된다.

구독을 등록하면 해제도 해야 한다.
`useEffect`가 반환하는 함수는 컴포넌트가 사라질 때 호출되는 정리(cleanup) 함수다.
11장에서 볼 `AuthProvider`가 인증 이벤트 구독을 이 패턴으로 관리하고, `src/hooks/useTts.ts`도 `voiceschanged` 이벤트 리스너를 같은 방식으로 정리한다.

### useCallback, 그리고 쓰지 않은 useMemo

React는 리렌더링 때 컴포넌트 함수 전체를 다시 실행하므로, 그 안에서 정의한 함수도 내용이 같아도 매번 새로 만들어진다.
`useCallback`은 지정한 값이 바뀔 때만 함수를 새로 만들어, 자식에게 넘기는 콜백이 렌더링마다 다른 함수로 바뀌는 일을 막는다.
`src/hooks/useTts.ts`의 `speak`가 실제 예다.
건네받은 영어 문장을 브라우저의 음성 합성 기능으로 읽어 주는 함수다.

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

### 커스텀 훅 1: useStudySession, 학습 세션 상태 기계

훅의 진짜 힘은 로직을 커스텀 훅(custom hook)으로 묶어 재사용하는 데 있다.
Echo Flip의 학습 흐름은 "전부 맞힐 때까지 틀린 카드를 라운드로 반복"하는 규칙을 갖는데, 이 규칙 전체가 `src/hooks/useStudySession.ts` 하나에 들어 있다.

상태가 여덟 필드로 얽혀 있으므로 `useState` 여러 개 대신 `useReducer`로 상태 기계(state machine)를 만들었다.
상태 기계란 여러 상태 값과 그것들을 바꾸는 규칙을 한곳에 모아, 정해진 규칙대로만 다음 상태로 넘어가게 한 구조다.
먼저 학습 세션이 기억할 값들과 일어날 수 있는 사건 세 가지(뒤집기, 채점, 다음 라운드)를 타입으로 선언한 부분이다.

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
리듀서는 React 없이도 호출할 수 있으므로, 9장에서 본 vitest로 상태 전이를 단위 테스트하기 쉽다.

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

### 커스텀 훅 2: useTts, 브라우저 API 감싸기

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

## 정리

이 장에서 살펴본 내용을 요약해 보자.

첫째, React는 DOM을 직접 고치는 대신 "상태가 이럴 때 화면은 이렇다"를 선언하는 방식이다.
상태가 바뀌면 React가 이전 결과와 비교해 달라진 부분만 실제 DOM에 반영한다.

둘째, 컴포넌트는 props를 받아 JSX를 반환하는 함수다.
상태를 밖에서 받는 제어 컴포넌트로 만들면 불일치가 사라지며, `Flashcard`가 `revealed`와 `onReveal`만 받아 두 학습 방향을 소화하는 것이 그 예다.

셋째, 조건은 `&&`와 삼항 연산자로, 목록은 `map`과 `key`로 그린다.
이벤트는 `on*` prop에 함수를 등록해 받고, 입력창은 `value`와 `onChange`로 상태와 묶는 제어 입력으로 다룬다.

넷째, 상태는 `useState`로 선언하고 setter로만 바꾼다.
외부 세계와의 접점은 `useEffect`에 두고, 반환한 정리 함수로 구독을 해제한다.

다섯째, 얽힌 상태는 `useReducer` 상태 기계로, 브라우저 API는 커스텀 훅으로 격리한다.
`useStudySession`과 `useTts`가 로직과 화면을 분리하는 실례다.
`useMemo` 같은 최적화 훅은 병목이 확인되기 전에는 쓰지 않는다.

다음 11장에서는 이 부품들이 하나의 앱으로 조립되는 층을 다룬다.
화면 전체가 공유하는 로그인 상태(Context), 서버에 원본이 있는 데이터의 관리(TanStack Query), 그리고 Next.js가 이 모두를 정적 파일로 구워 내는 구조다.
