# 8장 TypeScript: 타입으로 지키는 프런트엔드

Echo Flip의 백엔드가 Go라면 프런트엔드의 언어는 TypeScript다.
TypeScript를 선택한 이유는 1장에서 정리했다.
분량이 많아 TypeScript는 두 장에 걸쳐 다룬다.
이번 장의 주제는 언어와 타입 시스템이다.
기본 타입과 타입 추론에서 출발해, `src/lib/` 아래의 실제 코드를 재료로 유니온 타입, 인터페이스, 제네릭 같은 타입 기능과 모듈, 함수 문법까지 살펴본다.
다음 9장은 실행 중에 벌어지는 일, 즉 네트워크 응답을 기다리는 비동기 처리와 바깥에서 들어오는 데이터의 런타임 검증, 그리고 코드 품질을 지키는 도구를 다룬다.
React와 Next.js 자체는 10장과 11장의 몫이므로, 이 장은 언어로서의 TypeScript에 집중한다.

::: info [용어 풀이] 컴파일(트랜스파일)
사람이 쓴 소스 코드를 컴퓨터가 실제로 실행할 수 있는 형태로 실행 전에 미리 한꺼번에 번역해 두는 과정이다.
브라우저는 TypeScript를 직접 읽지 못하므로 실행 전에 자바스크립트로 바꿔 놓는데, 이렇게 한 언어를 다른 언어로 옮기는 컴파일을 특히 트랜스파일이라 부른다.
그래서 "컴파일 타임"은 코드를 실행하기 전 번역하는 시점을, "런타임"은 번역된 코드가 실제로 돌아가는 시점을 가리킨다.
:::

## 기본 타입과 타입 추론

TypeScript의 가장 기본이 되는 타입은 세 가지다.
문자열을 담는 string, 숫자를 담는 number, 참과 거짓을 담는 boolean이다.
변수 이름 뒤에 콜론을 붙여 `let name: string`처럼 타입을 표기한다.

그런데 실제 코드를 열어 보면 이런 타입 표기가 의외로 드물다.
컴파일러가 값을 보고 타입을 스스로 알아내는 타입 추론(type inference)이 있기 때문이다.
개발자가 일일이 적지 않아도, 컴파일러는 변수에 처음 담긴 값에서 타입을 읽어 낸다.

실제 코드를 보자.
아래는 카드 입력 폼 컴포넌트에서 사용자가 입력 중인 원문과 뜻을 담아 두는 대목이다.
`useState`는 화면의 상태(state)를 담아 두는 React 함수인데, 자세한 동작은 10장에서 다루므로 여기서는 "괄호 안의 초기값으로 시작하는 값 하나와, 그 값을 바꾸는 함수 하나를 만들어 준다" 정도로만 이해하면 된다.
대괄호로 두 변수를 나란히 받는 것은 그 한 쌍(값, 바꾸는 함수)을 나눠 담는 문법이다.

`src/components/CardForm.tsx`:

```ts
const [text, setText] = useState(initial?.text ?? "");
const [meaning, setMeaning] = useState(initial?.meaning ?? "");
```

`initial?.text ?? ""`는 "수정 중인 기존 카드(`initial`)가 있으면 그 원문을, 없으면 빈 문자열을 초기값으로 쓴다"는 뜻이다.
어디에도 string이라는 표기가 없다.
그러나 초기값이 어느 쪽이든 문자열이므로, 컴파일러는 `text`를 string으로 추론한다.
이후 `setText(123)`처럼 숫자를 넣으려 하면 그 자리에서 컴파일 오류가 난다.
타입을 적지 않았을 뿐, 검사는 똑같이 이루어진다.

boolean 추론도 마찬가지다.
아래는 CSV 가져오기 버튼에서 "지금 가져오는 중인지"를 담아 두는 상태다.

`src/components/CsvImportDialog.tsx`:

```ts
const [busy, setBusy] = useState(false);
```

초기값 `false`에서 `busy`는 boolean으로 추론된다.
`setBusy("yes")` 같은 대입은 컴파일 오류이고, `busy`를 읽는 쪽은 참과 거짓 두 경우만 신경 쓰면 된다.

배열은 원소 타입 뒤에 대괄호를 붙여 표기한다.
카드에 붙는 태그 목록이 좋은 예다.

`src/lib/types.ts`:

```ts
tags: string[];
```

`string[]`은 "문자열만 담는 배열"이라는 뜻이다.
`tags.push(3)`처럼 다른 타입의 값을 밀어 넣는 코드는 컴파일러가 막는다.

그렇다고 타입 표기가 아주 사라지는 것은 아니다.
초기값만으로 의도를 알 수 없거나, 잠시 뒤에 볼 유니온 타입처럼 허용 범위를 일부러 좁히고 싶은 자리에는 표기를 쓴다.
표기는 의도를 밝혀야 하는 곳에 쓰고 나머지는 추론에 맡기는 것이 TypeScript 코드의 일상적인 모습이다.

## 타입 기초: 도메인 모델을 코드로 옮기다

이제 도메인 모델로 들어가 보자.
Echo Flip 프런트엔드의 타입 정의는 `src/lib/types.ts` 한 파일에 모여 있다.

### 리터럴 타입과 유니온 타입

파일의 첫 줄부터 TypeScript다운 표현이 나온다.
아래 코드는 카드의 종류(`CardType`)와 학습 방향(`StudyDirection`)을 타입으로 정의한다.

`src/lib/types.ts`:

```ts
export type CardType = "word" | "sentence" | "idiom" | "concept";

/** Which side is shown as the question: text→meaning or meaning→text. */
export type StudyDirection = "text_to_meaning" | "meaning_to_text";
```

`"word"`처럼 특정 문자열 값 자체를 타입으로 쓰는 것을 리터럴 타입(literal type)이라 하고, 이를 `|`로 묶은 것이 유니온 타입(union type)이다.
`CardType` 타입의 변수에는 저 네 문자열 외에 어떤 값도 담을 수 없어, `cardType = "phrase"`라고 쓰면 그 자리에서 컴파일 오류다.

::: info [용어 풀이] 유니온 타입
여러 후보 타입 중 하나면 된다는 뜻을, 그 후보들을 `|` 기호로 이어 붙여 표현한 타입이다.
`"word" | "sentence" | "idiom" | "concept"`은 "이 값은 이 네 문자열 중 하나여야 한다"는 제약을 한 줄로 못박는다.
신호등 색이 빨강·노랑·초록 중 하나로 정해져 있듯, 허용되는 값의 목록을 미리 좁혀 두는 셈이다.
:::

TypeScript는 문자열 집합의 제약을 타입 선언 한 줄로 표현하고, 컴파일러가 모든 사용처에서 이를 강제한다.
enum 문법도 있지만, 문자열 유니온은 JSON 직렬화 값이 곧 타입 값이라 백엔드 API와 그대로 오가고 컴파일 후 남는 코드도 없어 이 프로젝트는 유니온만 쓴다.

### 인터페이스로 표현한 도메인 모델

도메인의 중심인 덱과 카드는 인터페이스(interface)로 정의한다.

`src/lib/types.ts`:

```ts
export interface Deck {
  id: string;
  /** Short Base36 identifier used in URLs (/decks/{slug}) and deck API paths. */
  slug: string;
  name: string;
  description: string | null;
  cardCount: number;
  shareSlug: string | null;
  // ...
}
```

주목할 부분은 `string | null`이다.
strict 모드의 TypeScript는 `null`과 `undefined`를 일반 타입에서 분리한다.
`description: string`이라고 선언하면 `null`을 담을 수 없고, `null`이 올 수 있는 필드는 유니온으로 명시해야 한다.
그래서 `deck.description.length`처럼 null 확인 없이 접근하는 코드는 컴파일 오류가 되고, "null일 수 있다"는 백엔드 API의 계약 위반을 컴파일러가 잡아 준다.

인터페이스는 구조적 타이핑(structural typing)을 따른다.
어떤 객체가 `Deck`의 모든 필드를 갖추면 명시적 선언 없이도 `Deck`으로 취급된다.
Go에도 인터페이스라는 비슷한 장치가 있어 메서드 집합으로 암묵적 구현을 판정하는데(7장의 `Store` 인터페이스가 그 예다), TypeScript는 프로퍼티 구조로 판정한다고 이해하면 된다.

### 옵셔널 프로퍼티: 입력과 저장의 구분

같은 카드라도 "서버에 저장된 카드"와 "사용자가 입력하는 카드"는 형태가 다르다.
`types.ts`는 이를 두 타입으로 구분한다.

`src/lib/types.ts`:

```ts
export interface Card {
  id: string;
  deckId: string;
  // ...
  text: string;
  meaning: string;
  cardType: CardType;
  tags: string[];
  phonetic: string | null;
  // ...
  attempts: number;
  // ...
  dueAt: string;
  lastReviewedAt: string | null;
}

export interface CardInput {
  text: string;
  meaning: string;
  cardType: CardType;
  tags: string[];
  phonetic?: string | null;
  example?: string | null;
  notes?: string | null;
}
```

`Card`에는 서버가 부여하는 `id`, 간격 반복(Spaced Repetition) 상태인 `attempts`, `dueAt` 등이 있지만 `CardInput`에는 없다.
생성 요청에 이런 필드를 실어 보내는 실수를 타입이 원천 차단한다.

`phonetic?: string | null`의 `?`는 옵셔널 프로퍼티(optional property) 표시인데, `| null`과는 의미가 다르다.
`?`는 "프로퍼티 자체가 없어도 된다"이고, `| null`은 "프로퍼티는 있되 값이 null일 수 있다"이다.
입력 폼에서는 발음 기호를 아예 안 보낼 수도(`?`), 지우기 위해 명시적으로 null을 보낼 수도(`| null`) 있어 둘을 겹쳐 썼다.

스마트 덱 규칙도 옵셔널 프로퍼티의 좋은 예다.

`src/lib/types.ts`:

```ts
export type SmartRuleType = "high_error" | "stale" | "tag" | "recent";

export interface SmartRule {
  type: SmartRuleType;
  minAttempts?: number;
  minErrorRate?: number;
  notReviewedDays?: number;
  tags?: string[];
  addedWithinDays?: number;
  limit?: number;
}
```

`type` 필드만 필수이고 나머지는 규칙 종류에 따라 선택적으로 채워진다.
"오답률 높은 카드" 규칙은 `minErrorRate`를, "태그" 규칙은 `tags`를 쓰는 식이다.

### 제네릭: 하나의 fetch 래퍼로 모든 응답 다루기

프런트엔드는 수십 개의 API 엔드포인트를 호출하고 엔드포인트마다 응답 타입이 다른데, 호출 함수를 엔드포인트 수만큼 만들 수는 없다.
이럴 때 쓰는 것이 제네릭(generic)이다.

::: info [용어 풀이] 제네릭(Generic)
담을 내용물의 종류를 미리 못박지 않고, 쓰는 순간 정해지도록 비워 둔 타입 자리다.
내용물이 무엇이든 담을 수 있으면서도 한번 담으면 그 종류를 기억하는 상자를 떠올리면 된다.
그래서 함수 하나로 여러 응답을 다루되, 꺼낼 때는 넣은 종류 그대로 안전하게 꺼낼 수 있다.
:::

`src/lib/api.ts`:

```ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return request(path, await authHeader(), init);
}

/** Like `api`, but does not require a session (public endpoints). */
export async function apiPublic<T>(path: string, init?: RequestInit): Promise<T> {
  return request(path, await optionalAuthHeader(), init);
}

async function request<T>(
  path: string,
  auth: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    // ... 인증·Content-Type 헤더 병합
  });
  // ... 실패 응답이면 상태 코드를 담은 ApiError를 던진다
  if (res.status === 204) return undefined as T;
  return res.json();
}
```

`api<T>`의 `T`는 타입 매개변수다.
호출하는 쪽이 응답 타입을 지정하면, 반환 타입 `Promise<T>`가 그에 맞춰 결정된다.
실제 호출부를 보자.
아래는 화면에서 덱 목록을 불러오는 코드다.

`src/app/decks/page.tsx`:

```ts
const { data: decks } = useQuery({
  queryKey: ["decks"],
  queryFn: () => api<Deck[]>("/api/decks"),
});
```

`api<Deck[]>`이라고 지정하는 순간 `decks`는 `Deck[] | undefined`로 추론되고, 이후 `decks.map(...)` 안에서 각 원소가 `Deck`으로 취급된다.
`deck.slug` 오타나 존재하지 않는 필드 접근이 전부 컴파일 시점에 걸린다.
HTTP 통신 로직은 한 벌인데 타입 안전성은 엔드포인트별로 확보되는 것, 이것이 제네릭의 효용이다.

## interface와 type의 구분

`src/lib/types.ts`를 다시 훑어보면 두 가지 선언이 섞여 있다.
카드 종류는 `type`으로, 덱과 카드는 `interface`로 선언됐다.

`src/lib/types.ts`:

```ts
export type CardType = "word" | "sentence" | "idiom" | "concept";

export interface Deck {
  // ...
}
```

같은 파일 안에 두 문법이 공존하는 것은 실수가 아니라 관례다.
`type`은 어떤 타입에 별명을 붙이는 타입 별칭(type alias) 문법이라, 유니온처럼 `interface`로는 표현할 수 없는 타입에 이름을 붙이려면 `type`을 써야 한다.
반면 객체의 구조를 정의하는 일은 둘 다 할 수 있어서, 어느 쪽을 쓸지는 프로젝트의 관례로 정한다.

이 저장소의 관례는 단순하다.
`Deck`, `Card`처럼 필드를 가진 객체의 구조는 interface로, `CardType`처럼 유니온이나 별칭은 type으로 쓴다.
읽는 사람은 선언 키워드만 보고도 "이건 객체의 생김새구나", "이건 값의 후보 목록이구나"를 짐작할 수 있다.
TypeScript 공식 문서도 객체 구조에는 interface를 먼저 쓰라고 권하므로, 이 관례는 무난한 출발점이다.

## 유틸리티 타입

TypeScript에는 이미 있는 타입을 재료로 새 타입을 만들어 주는 내장 도구가 여럿 있는데, 이를 유틸리티 타입(utility type)이라 부른다.
이 저장소에서 실제로 쓰는 것은 `Record`다.

학습 화면의 카드 컴포넌트를 보자.
아래 코드는 카드 종류의 영문 값(`"word"` 등)을 화면에 보여 줄 한글 이름표로 바꾸는 대응표다.

`src/components/Flashcard.tsx`:

```ts
const TYPE_LABEL: Record<Card["cardType"], string> = {
  word: "단어",
  sentence: "문장",
  idiom: "숙어",
  concept: "개념",
};
```

`Record<K, V>`는 "키는 K, 값은 V인 객체" 타입을 만들어 주는 유틸리티 타입이다.
`Card["cardType"]`은 인덱스드 액세스 타입(indexed access type)으로, `Card` 타입에서 `cardType` 필드의 타입만 뽑아 쓰는 문법이다.
결국 `TYPE_LABEL`은 "네 가지 카드 종류 각각을 키로 갖고, 값은 문자열인 객체"라는 타입이 된다.

이 한 줄의 효용은 도메인이 확장될 때 드러난다.
나중에 `CardType` 유니온에 다섯 번째 종류가 추가되면, 이 대응표는 "키 하나가 빠졌다"는 컴파일 오류를 낸다.
화면 어딘가의 이름표를 고쳐야 한다는 사실을 사람이 기억할 필요 없이, 컴파일러가 할 일 목록을 만들어 준다.
`CardType`을 직접 써도 되지만, `Card["cardType"]`처럼 카드가 실제로 갖는 필드에서 뽑아 쓰면 이 대응표가 무엇의 이름표인지 출처가 분명해진다.

더 느슨한 사용도 있다.
앞서 본 `request<T>`의 매개변수 `auth: Record<string, string>`이 그것이다.
HTTP 요청에 실을 인증 헤더는 이름과 개수가 상황에 따라 달라지므로, `src/lib/api.ts`의 헤더 함수들은 "문자열 키에 문자열 값"이라는 형태만 약속한다.
키 집합을 유니온으로 못박은 위의 대응표와 대비되는 쓰임이다.

## ES 모듈: import와 export

TypeScript 코드는 ES 모듈(ES Modules) 단위로 구성된다.
파일이 곧 모듈이고, `export`한 것만 밖에서 보인다.

`src/lib/csv.ts`의 상단을 보자.
아래는 이 파일이 쓰는 것들을 다른 파일에서 가져오는 import 구문이다.

```ts
import Papa from "papaparse";
import type { CardInput, CardType } from "./types";

const TYPES: CardType[] = ["word", "sentence", "idiom", "concept"];
```

두 가지 import 형태가 구분된다.
`import Papa from`은 라이브러리의 기본(default) 내보내기를 가져오고, `import { rowToCard } from "./csv"`(테스트 파일에서 사용) 같은 형태는 이름 있는(named) 내보내기를 가져온다.
`import type`은 TypeScript 고유 문법으로, 타입으로만 쓰고 값으로는 쓰지 않음을 명시한다.
타입은 컴파일 후 사라지므로 이 import는 빌드 결과물에서 완전히 제거된다.

`export`가 없는 `TYPES` 상수는 모듈 내부에 숨는다.
Go가 식별자의 대소문자로 공개 범위를 정했다면, TypeScript는 `export` 키워드로 정한다.
참고로 `TYPES`의 타입 표기 `CardType[]`은 앞서 본 배열 표기로, "카드 종류 값만 담는 배열"이라는 뜻이다.

컴포넌트 쪽 코드에서는 `import { api } from "@/lib/api"`처럼 `@/` 접두사를 볼 수 있다.
이는 `tsconfig.json`의 `paths` 설정(`"@/*": ["./src/*"]`)이 만든 경로 별칭(path alias)으로, `../../lib/api` 같은 상대 경로 사다리를 없애 준다.

## 화살표 함수

TypeScript에서 함수를 만드는 표기는 크게 두 가지다.
`function` 키워드로 이름을 내걸고 선언하는 함수 선언과, 화살표 기호(`=>`)로 만든 함수를 값처럼 변수에 담거나 다른 함수에 넘기는 화살표 함수(arrow function)다.

먼저 함수 선언이다.
아래는 스마트 덱 규칙을 URL에 실을 수 있는 문자열로 바꾸는 함수다.

`src/lib/rules.ts`:

```ts
export function encodeRule(rule: SmartRule): string {
  return encodeURIComponent(JSON.stringify(rule));
}
```

`src/lib/` 아래의 공개 함수들(`ruleLabel`, `decodeRule`, `parseCsv` 등)은 모두 이 형태다.
이름이 앞에 나와 이 파일이 제공하는 기능이 한눈에 들어오고, `export function`으로 시작하는 줄만 훑어도 모듈의 목차가 그려진다.

화살표 함수는 함수를 값으로 다뤄야 하는 자리에서 쓴다.
카드 입력 폼의 제출 처리를 보자.
아래 코드는 폼이 제출될 때 입력값을 다듬어 상위 컴포넌트로 넘기는 이벤트 핸들러다.

`src/components/CardForm.tsx`:

```ts
const submit = (e: React.FormEvent) => {
  e.preventDefault();
  if (!text.trim() || !meaning.trim()) {
    toast("원문과 뜻을 모두 입력해주세요", "error");
    return;
  }
  // ...
};
```

`(매개변수) => { 본문 }` 형태로, `function` 키워드도 함수 이름도 없이 함수를 만들어 `submit`이라는 변수에 담았다.
화면 요소에 바로 끼워 넣는 한 줄짜리도 흔하다.
같은 파일에서 입력창의 내용이 바뀔 때마다 상태를 갱신하는 부분이다.

`src/components/CardForm.tsx`:

```tsx
<textarea
  value={text}
  onChange={(e) => setText(e.target.value)}
  // ...
/>
```

`(e) => setText(e.target.value)`는 "입력 이벤트 `e`를 받아 그 값을 상태에 넣는다"는 함수를 그 자리에서 만들어 `onChange`에 넘긴다.
본문이 표현식 하나면 중괄호와 `return`을 생략할 수 있어, 다른 함수에 넘겨 두고 나중에 불리게 하는 함수인 콜백(callback)에 특히 잘 어울린다.
같은 파일의 `tags.split(",").map((t) => t.trim())`처럼 배열의 각 원소를 다듬는 콜백도 마찬가지다.

이 저장소의 경향은 일관된다.
파일 최상위에서 내보내는 함수와 React 컴포넌트는 `function` 선언으로, 이벤트 핸들러와 콜백처럼 값으로 넘기는 함수는 화살표로 쓴다.
문법상 어느 쪽으로도 쓸 수 있는 자리가 많지만, 형태만 보고 역할을 짐작할 수 있다는 것이 이 관례의 실익이다.

## 정리

이번 장에서 살펴본 내용을 정리해 보자.

첫째, string, number, boolean 세 원시 타입이 기본이고, 실제 코드에서는 초기값에서 타입을 읽어 내는 타입 추론이 표기를 대신한다.
`useState(false)` 한 줄로도 이후의 잘못된 대입은 전부 컴파일 오류가 된다.

둘째, `src/lib/types.ts`는 리터럴 유니온(`CardType`), null 명시(`string | null`), 옵셔널 프로퍼티, 저장형(`Card`)과 입력형(`CardInput`)의 분리로 도메인 계약을 코드로 표현했고, `src/lib/api.ts`의 제네릭 래퍼 `api<T>`는 통신 로직 한 벌로 모든 엔드포인트의 타입 안전성을 확보한다.

셋째, 객체의 구조는 interface, 유니온과 별칭은 type이라는 관례로 두 선언을 구분하고, `Record<Card["cardType"], string>` 같은 유틸리티 타입은 도메인이 확장될 때 고칠 곳을 컴파일 오류로 알려 준다.

넷째, 코드는 파일 단위의 ES 모듈로 나뉘어 `export`한 것만 밖에서 보이고, 최상위 공개 함수는 `function` 선언, 콜백과 이벤트 핸들러는 화살표 함수라는 형태 구분이 코드 읽기를 돕는다.

여기까지가 컴파일 시점의 안전망이다.
그러나 타입은 컴파일하면 사라지고, 프로그램이 실제로 돌아가는 동안에는 아무것도 검사해 주지 않는다.
다음 9장에서는 타입이 지켜 주지 못하는 실행 시점의 세계로 들어간다.
네트워크 응답을 기다리는 비동기 처리와, 바깥에서 들어온 데이터를 문 앞에서 확인하는 런타임 검증이 주제다.
