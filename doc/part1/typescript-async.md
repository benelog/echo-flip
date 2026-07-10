# 9장 TypeScript 실전: 비동기 처리와 런타임 검증

8장에서 본 타입 시스템은 실행 전에 잘못을 걸러 주는 안전망이었다.
이번 장은 실행 중의 세계를 다룬다.
프로그램이 실제로 돌아가기 시작하면 타입 검사가 해 주는 일이 없고, 두 가지 문제가 새로 나타난다.

하나는 시간이다.
네트워크 건너편의 응답은 언제 올지 모르는데, 브라우저는 그동안 화면을 멈출 수 없다.
이를 다루는 것이 Promise와 async/await로 대표되는 비동기 처리다.
다른 하나는 신뢰다.
외부 API의 응답이나 사용자가 올린 파일처럼 바깥에서 들어오는 데이터는 타입 선언과 다르게 생겼을 수 있어, 실행 중에 그 자리에서 확인하는 런타임 검증이 필요하다.
이 장에서는 두 문제를 Echo Flip의 실제 코드로 살펴보고, 마지막으로 strict 모드의 `tsconfig.json`과 vitest 테스트 등 타입과 코드 품질을 지키는 도구를 정리한다.

## Promise: 미래의 값

비동기 처리의 중심에는 Promise가 있다.
음식점에서 주문하고 받는 진동벨을 떠올려 보자.
주문한다고 음식이 바로 나오지는 않지만, 진동벨이 있으니 자리로 돌아가 다른 일을 하다가 벨이 울리면 받으러 가면 된다.
Promise는 이 진동벨에 해당한다.
"지금 당장은 결과가 없지만, 준비되면 알려 주겠다"는 약속을 담은 객체다.

Promise는 세 가지 상태 중 하나에 있다.
주문 직후처럼 결과를 기다리는 대기(pending), 음식이 나와 벨이 울린 이행(fulfilled), 재료가 떨어져 주문이 취소된 거부(rejected)다.
대기로 시작해 이행이나 거부 중 하나로 한 번만 바뀌고, 한 번 정해진 결과는 다시 바뀌지 않는다.

::: info [용어 풀이] Promise(프로미스)
지금은 값이 없지만 나중에 결과(성공한 값 또는 실패한 이유)를 주겠다는 약속을 담은 객체다.
음식점의 진동벨처럼 받아 두면 기다리는 동안 다른 일을 하다가, 준비됐다는 신호가 올 때 결과를 받으면 된다.
결과가 준비되면 실행할 함수는 `.then`으로 미리 등록해 둔다.
:::

실제 코드에서 Promise를 직접 다루는 대목을 보자.
아래는 앱이 처음 뜰 때 "이 사용자가 로그인돼 있는가"를 확인하는 코드다.
로그인 정보는 브라우저 저장소와 인증 서버에서 가져와야 해서 결과가 즉시 나오지 않으므로, `getSession()`은 값 대신 Promise를 돌려준다.

`src/components/AuthProvider.tsx`:

```ts
const client = supabase();
client.auth.getSession().then(({ data }) => {
  setSession(data.session);
  setLoading(false);
});
```

`.then(...)`은 "결과가 준비되면 이 함수를 실행하라"고 등록하는 메서드다.
등록만 해 두고 코드는 다음 줄로 넘어가며, 나중에 Promise가 이행되면 넘겨 둔 함수가 불려 세션을 상태에 담고 로딩 표시를 끈다.
`({ data })`는 결과 객체에서 `data` 필드만 꺼내 받는 구조 분해(destructuring) 문법이다.
진동벨을 받아 두고 자리로 돌아가는 장면이 코드로는 이렇게 생겼다.

`.then`은 정직한 표기지만, 여러 비동기 호출이 이어지면 함수 안에 함수가 겹겹이 쌓여 읽기 어려워진다.
그래서 요즘 코드는 대부분 다음 절의 async/await 문법으로 Promise를 다루고, `.then`은 위처럼 등록 한 번으로 끝나는 자리에 남아 있다.

## async/await와 fetch

브라우저의 네트워크 호출은 모두 비동기다.
TypeScript(와 현대 자바스크립트)는 이를 Promise와 async/await 문법으로 다룬다.
사전 조회 함수가 전형적인 형태다.
아래 함수는 무료 사전 API에 단어를 물어 발음 기호와 뜻을 받아 온다.

`src/lib/dictionary.ts`:

```ts
export class WordNotFoundError extends Error {}

export async function lookupWord(word: string): Promise<DictEntry> {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`,
  );
  if (res.status === 404) throw new WordNotFoundError(word);
  if (!res.ok) throw new Error(`사전 조회 실패 (${res.status})`);
  return mapEntries(await res.json());
}
```

`async` 함수는 항상 Promise를 반환하고, 함수 안에서 `await`는 Promise가 이행될 때까지 "기다리는 것처럼" 코드를 순차적으로 쓰게 해 주되 그 사이 브라우저는 다른 일을 계속한다.
`.then`에 함수를 등록하던 일을, 위에서 아래로 읽히는 보통 코드처럼 쓰게 해 주는 문법이다.
Go가 고루틴과 채널로 다루는 동시성을, 자바스크립트는 단일 스레드 이벤트 루프와 Promise로 다룬다고 대비해서 이해하면 좋다.

오류 처리 방식도 눈여겨보자.
5장에서 본 Go가 `(값, err)` 다중 반환으로 오류를 값으로 다뤘다면, TypeScript는 예외를 던진다.
단어가 사전에 없는 경우(404)는 서버 장애와 성격이 다르므로 `WordNotFoundError`라는 별도 클래스로 던지고, 호출하는 쪽이 `instanceof`로 구분해 "직접 입력하세요" 같은 안내로 처리한다.
`src/lib/api.ts`의 `ApiError`도 같은 패턴으로, HTTP 상태 코드를 프로퍼티로 담아 던진다.

### try/catch/finally: 뒷정리는 반드시 실행된다

던져진 오류는 어디선가 받아야 한다.
받는 문법이 try/catch이고, 성공이든 실패든 마지막에 반드시 실행되는 뒷정리 자리가 finally다.
`lookupWord`를 실제로 호출하는 카드 입력 폼에서 세 블록이 모두 쓰인다.
아래 코드는 "사전에서 채우기" 버튼을 눌렀을 때 사전을 조회해 비어 있는 입력란을 채워 주는 함수다.

`src/components/CardForm.tsx`:

```ts
const fillFromDictionary = async () => {
  setLooking(true);
  try {
    const entry = await lookupWord(text);
    // Fill only fields the user hasn't typed yet.
    if (entry.phonetic && !phonetic) setPhonetic(entry.phonetic);
    if (entry.definition && !meaning) setMeaning(entry.definition);
    if (entry.example && !example) setExample(entry.example);
    toast("사전에서 채웠어요");
  } catch (e) {
    toast(
      e instanceof WordNotFoundError
        ? "사전에서 찾을 수 없어요"
        : "사전 조회에 실패했어요",
      "error",
    );
  } finally {
    setLooking(false);
  }
};
```

흐름을 따라가 보자.
버튼을 누르면 먼저 `looking` 상태를 켜서 "조회 중" 표시를 띄우고 버튼을 잠근다.
try 블록 안에서 `await lookupWord(text)`가 성공하면 사용자가 아직 채우지 않은 입력란만 사전 결과로 채운다.
`lookupWord`가 오류를 던지면 try의 남은 줄은 건너뛰고 곧장 catch 블록으로 온다.
catch가 받는 `e`가 바로 그 던져진 오류 객체이고, `instanceof`로 "단어가 사전에 없다"(`WordNotFoundError`)와 그 밖의 실패(네트워크 장애 등)를 구분해 다른 안내 문구를 띄운다.

핵심은 finally다.
finally 블록은 성공했든 오류가 났든 반드시 실행된다.
`looking`을 끄는 코드를 try 끝과 catch 끝에 두 번 쓰는 대신 finally에 한 번만 두면, 어떤 경로로 끝나도 "조회 중" 표시가 남는 일이 없다.
이를 빠뜨리면 오류가 난 뒤 버튼이 잠긴 채로 남아, 사용자가 화면을 새로 고쳐야만 풀리는 버그가 된다.
CSV 가져오기 버튼(`src/components/CsvImportDialog.tsx`)도 같은 패턴으로, 가져오는 중임을 뜻하는 `busy` 상태를 finally에서 해제한다.

### 콜백을 Promise로 감싸기

콜백 기반 API를 Promise로 감싸는 패턴도 이 저장소에 있다.
papaparse는 파싱 완료를 `complete` 콜백으로 알려 주는데, `parseCsv`는 이를 `new Promise`로 감싸 async/await 세계로 편입시킨다.

`src/lib/csv.ts`:

```ts
export function parseCsv(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        // ... 행별 변환 후
        resolve({ cards, invalid });
      },
      error: reject,
    });
  });
}
```

`new Promise`에 넘긴 함수 안에서 `resolve`를 부르면 그 Promise가 이행되고, `reject`를 부르면 거부된다.
이렇게 감싸 두면 호출부는 `const { cards, invalid } = await parseCsv(file)` 한 줄로 끝난다.
`Papa.parse<CsvRow>`처럼 라이브러리 함수에 제네릭으로 행 타입을 알려 주면 `complete` 콜백 안의 `result.data`가 `CsvRow[]`로 추론되는 것도 눈여겨보자.

## 컴파일 타임 타입과 런타임 검증의 간극

여기까지 보면 타입이 모든 것을 지켜 줄 것 같지만, 중요한 한계가 있다.
TypeScript의 타입은 컴파일하면 사라지고, 런타임에는 아무것도 검사하지 않는다.
컴파일 시점에 걸리는 오류는 편집자가 원고를 인쇄에 넘기기 전에 오탈자를 잡아내는 것과 같아 실행 전에 안전하게 걸러지지만, 런타임 오류는 이미 인쇄되어 독자 손에 들어간 책에서 뒤늦게 드러나는 오류처럼 프로그램이 실제로 돌아가 그 대목에 이르러서야 터진다.

::: info [용어 풀이] 런타임 검증
프로그램이 실제로 돌아가는 도중에, 들어온 값이 기대한 형태가 맞는지 그 자리에서 실제로 확인하는 일이다.
타입 검사가 실행 전 설계도를 미리 점검하는 것이라면, 런타임 검증은 문을 열고 들어오는 손님을 문 앞에서 한 명씩 신분 확인하는 것에 가깝다.
타입은 컴파일하면 사라져 실행 중에는 아무것도 막아 주지 못하므로, 바깥에서 들어오는 데이터에는 이 확인이 따로 필요하다.
:::

### 타입은 약속이지 보증이 아니다

8장에서 본 fetch 래퍼 `request<T>`가 어떻게 끝나는지 다시 보자.
모든 API 호출이 거쳐 가는 이 함수(`src/lib/api.ts`)는 마지막에 서버 응답의 JSON을 그대로 반환한다.

```ts
async function request<T>(
  path: string,
  auth: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  // ...
  return res.json();
}
```

`res.json()`의 반환 타입은 `any`다.
서버가 실제로 무엇을 보내든 TypeScript는 "호출자가 지정한 `T`가 왔다"고 믿어 버린다.
`api<Deck[]>`은 검증이 아니라 선언, 즉 개발자가 컴파일러에게 하는 약속이다.

이 간극을 어디까지 메울지는 데이터의 출처에 따라 판단하면 된다.
Echo Flip에서 외부 데이터가 들어오는 경로는 세 가지다.
첫째, 우리가 만든 Go API의 응답이다.
둘째, 제삼자가 운영하는 무료 사전 API의 응답이다.
셋째, 사용자가 업로드하는 CSV 파일이다.
첫째는 스키마를 우리가 통제하고 프런트와 백엔드를 같은 저장소에서 함께 고치므로, 어긋날 위험이 상대적으로 낮다.
둘째와 셋째는 형태를 전혀 통제할 수 없으므로 런타임 검증이 필수다.

### 손으로 쓰는 방어 코드

이 프로젝트의 현재 코드는 통제 밖 데이터를 손으로 검증한다.
사전 API 응답부터 보자.
아래 코드는 외부 사전 API가 돌려준 항목에서 발음 기호를 골라내는 함수다.

`src/lib/dictionary.ts`:

```ts
interface ApiEntry {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: ApiMeaning[];
}

export function mapEntries(entries: ApiEntry[]): DictEntry {
  const first = entries[0] ?? {};
  const phonetic =
    first.phonetic ||
    first.phonetics?.map((p) => p.text).find(Boolean) ||
    null;
  // ...
}
```

`ApiEntry`의 모든 필드가 8장에서 본 옵셔널 프로퍼티인데, 외부 API가 무엇을 빠뜨릴지 모른다는 전제를 타입에 반영한 것이다.
필드가 전부 옵셔널이면 strict 모드 컴파일러가 모든 접근에 `?.`(옵셔널 체이닝)나 `??`(null 병합) 처리를 강제하므로, 타입 선언 자체가 방어 코드를 유도하는 효과가 있다.

URL 쿼리 파라미터로 전달되는 스마트 덱 규칙도 마찬가지다.
아래 `decodeRule`은 URL에 담겨 온 규칙 문자열을 해석해 `SmartRule` 객체로 되돌린다.

`src/lib/rules.ts`:

```ts
export function decodeRule(raw: string | null): SmartRule | null {
  if (!raw) return null;
  try {
    const rule = JSON.parse(decodeURIComponent(raw));
    return typeof rule === "object" && rule?.type ? rule : null;
  } catch {
    return null;
  }
}
```

URL은 사용자가 마음대로 조작할 수 있으므로 `JSON.parse` 결과를 그대로 믿지 않고, 객체 여부와 `type` 필드 존재를 확인한 뒤에야 `SmartRule`로 반환한다.
다만 이 검증은 최소한이라 `minErrorRate`에 문자열이 들어 있어도 통과한다.
손으로 쓰는 검증은 필드가 늘수록 장황해지고 빠뜨리기 쉽다.

### zod: 스키마로 선언하는 런타임 검증

이 간극을 체계적으로 메우는 도구가 zod다.
zod는 스키마(schema)를 값으로 선언하면 런타임 검증 함수와 TypeScript 타입을 동시에 얻는 라이브러리다.

솔직하게 밝혀 두면, 이 저장소의 `package.json`에는 zod 의존성(`"zod": "^4.4.3"`)이 선언돼 있지만 아직 import해서 쓰는 코드는 없다.
손 검증으로 충분한 범위에서 개발이 진행됐고, zod 도입은 예정만 된 상태다.
그래서 여기서는 위의 `decodeRule`을 zod로 옮기면 어떤 모습이 되는지, 도입 예시 코드로 보여 주겠다.

```ts
// 도입 예시: 현재 저장소에는 없는 코드다.
import { z } from "zod";

const SmartRuleSchema = z.object({
  type: z.enum(["high_error", "stale", "tag", "recent"]),
  minErrorRate: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  // ... 나머지 필드 생략
});

export type SmartRule = z.infer<typeof SmartRuleSchema>;

export function decodeRule(raw: string | null): SmartRule | null {
  if (!raw) return null;
  try {
    const parsed = SmartRuleSchema.safeParse(
      JSON.parse(decodeURIComponent(raw)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

핵심은 두 가지다.
첫째, `safeParse`가 모든 필드의 타입과 범위를 런타임에 실제로 검사한다.
`minErrorRate: "abc"` 같은 값은 여기서 걸러진다.
둘째, `z.infer`로 스키마에서 TypeScript 타입을 뽑아내므로, 검증 규칙과 타입 정의가 한 곳에서 관리된다.
손 검증 방식에서는 `types.ts`의 인터페이스와 `decodeRule`의 검사 로직이 따로 놀며 어긋날 수 있지만, zod에서는 구조적으로 어긋날 수 없다.

그렇다고 모든 API 응답을 zod로 감싸는 것은 과잉이 되기 쉬운데, 스키마 코드가 타입 정의만큼 늘어나고 대량 목록 응답에는 검증 비용도 붙기 때문이다.
우리 백엔드처럼 스키마를 함께 관리하는 출처라면 컴파일 타임 타입 공유로 충분한 경우가 많다.
반면 사용자 입력, 제삼자 API, URL·로컬 스토리지처럼 신뢰 경계(trust boundary)를 넘어오는 데이터에는 검증 비용이 확실히 회수된다.
경계에는 스키마 검증, 내부에는 타입 공유라는 원칙으로 정리할 수 있다.

### 타입 단언이라는 탈출구와 그 위험

런타임 간극과 관련해 한 가지 더, 타입 단언(type assertion)을 짚어 두자.
`값 as 타입`은 컴파일러의 판단을 개발자가 덮어쓰는 문법이다.

`src/lib/csv.ts`의 한 줄을 보자.
CSV의 종류 열 값을 카드 타입으로 바꾸는 대목이다.

```ts
const type = row.type?.trim().toLowerCase() as CardType;
return {
  // ...
  cardType: TYPES.includes(type) ? type : "word",
```

CSV의 `type` 열에는 아무 문자열이나 올 수 있는데, `as CardType`으로 일단 단언해 두고 바로 다음 줄에서 `TYPES.includes(type)`로 실제 값을 확인해 목록에 없으면 `"word"`로 대체한다.
단언 직후에 런타임 검사가 따라붙기 때문에 안전한 사용이다.
그러나 검사 없는 `as`는 컴파일러를 침묵시킬 뿐 값을 바꾸지 않는다.
`as`가 보이면 "이 단언을 정당화하는 런타임 근거가 근처에 있는가"를 확인하는 습관을 들이자.

## UI와 분리된 순수 로직 모듈

### src/lib라는 경계

Echo Flip 프런트엔드의 디렉터리를 보면 화면은 `src/app/`과 `src/components/`에, 로직은 `src/lib/`에 나뉘어 있다.
`src/lib/` 아래의 `csv.ts`, `dictionary.ts`, `rules.ts`, `api.ts`, `types.ts`는 React를 전혀 import하지 않는다.
CSV 행을 카드로 바꾸고 사전 응답을 정리하는 일은 UI와 무관한 도메인 로직이기 때문이다.

이 분리의 가치는 순수 함수(pure function)에서 나온다.
순수 함수는 같은 입력에 항상 같은 출력을 내고, 바깥 상태를 건드리지 않는 함수다.
`rowToCard`, `mapEntries`, `decodeRule`, `ruleLabel`이 모두 순수 함수다.

`src/lib/rules.ts`의 `ruleLabel`을 보자.
규칙 종류에 따라 사람이 읽을 설명 문구를 만들어 주는 함수다.

```ts
export function ruleLabel(rule: SmartRule): string {
  switch (rule.type) {
    case "high_error":
      return `오답률 ${Math.round((rule.minErrorRate ?? 0.4) * 100)}% 이상`;
    case "stale":
      return `${rule.notReviewedDays ?? 7}일 이상 안 본 카드`;
    case "tag":
      return `태그: ${(rule.tags ?? []).join(", ")}`;
    case "recent":
      return `최근 ${rule.addedWithinDays ?? 7}일 추가`;
  }
}
```

유니온 타입과 `switch`의 궁합도 여기서 드러난다.
`rule.type`은 `SmartRuleType` 유니온이므로 컴파일러는 네 개의 `case`가 모든 경우를 소진했음을 안다.
그래서 `default` 없이도 반환 타입이 `string`으로 성립한다.
나중에 유니온에 다섯 번째 규칙이 추가되면, 이 함수는 "string을 반환하지 않는 경로가 있다"는 컴파일 오류를 내며 수정할 곳을 알려 준다.
도메인 확장이 컴파일 오류라는 형태의 할 일 목록을 만들어 주는 것이다.

### 왜 이렇게 나누는가

첫째, 테스트가 쉬워진다.
순수 함수는 브라우저도, 네트워크도, React 렌더러도 없이 Node.js에서 밀리초 단위로 검증할 수 있다.

둘째, 화면 교체에 강해진다.
CSV 가져오기 UI를 다이얼로그에서 별도 페이지로 바꿔도 `parseCsv`와 `rowToCard`는 한 줄도 바뀌지 않는다.

셋째, AI 에이전트와의 협업 단위가 명확해진다.
"CSV의 legacy 헤더도 지원하라" 같은 요구는 `csv.ts`와 그 테스트 파일만 건드리면 되는 작업으로 좁혀지고, 변경 범위가 좁을수록 결과물 검증도 쉬워진다.

다만 모든 것을 lib로 뽑는 것이 능사는 아니다.
한 컴포넌트에서만 쓰는 서너 줄짜리 헬퍼까지 분리하면 파일만 늘고 응집도는 떨어진다.
"두 곳 이상에서 쓰이거나, 단위 테스트가 필요한 로직"을 분리 기준으로 삼으면 무리가 없다.

## 품질을 지키는 도구

### tsconfig.json과 strict 모드

TypeScript 컴파일러의 동작은 `tsconfig.json`이 결정한다.
Echo Flip의 설정에서 핵심만 발췌한다.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

가장 중요한 것은 `"strict": true`다.
이 한 줄이 `strictNullChecks`(null·undefined를 타입으로 분리), `noImplicitAny`(타입 추론이 불가능한 자리에 암묵적 any 금지) 등 엄격 검사 묶음을 한꺼번에 켠다.
strict 없이 쓰는 TypeScript는 안전망의 절반을 접어 둔 것과 같으므로, 기존 자바스크립트를 점진 전환하는 경우가 아니라면 처음부터 켜는 것이 정답에 가깝다.

`"noEmit": true`도 이 프로젝트의 구조를 보여 준다.
자바스크립트 파일 생성은 Next.js의 번들러가 담당하므로, `tsc`는 검사만 하고 아무것도 출력하지 않는다.
`moduleResolution: "bundler"` 역시 모듈 해석을 번들러 방식에 맞춘 것이고, `isolatedModules`는 파일 단위 변환이 안전하도록 `import type` 같은 구분을 강제한다.
컴파일러가 변환기가 아니라 검증기로만 쓰이는 이 구도는 최근 TypeScript 프로젝트의 표준적인 모습이다.

### tsc --noEmit: 가장 싼 검증

타입 검사만 따로 돌리고 싶으면 다음 한 줄이면 된다.

```bash
npx tsc --noEmit
```

빌드보다 훨씬 빠르게 프로젝트 전체의 타입 오류를 보고한다.
1장에서 말했듯 이 명령은 에이전트가 만든 코드의 1차 관문으로 쓰기 좋고, 사람의 리뷰는 이 관문을 통과한 코드에 집중하면 된다.

### vitest로 단위 테스트

테스트 러너는 vitest다.
`package.json`의 `"test": "vitest run"`이 전부이고, 별도의 vitest 설정 파일 없이 기본값으로 동작한다.
Jest 대신 vitest를 쓴 이유는 단순한데, TypeScript와 ES 모듈을 변환 설정 없이 바로 실행하고 `src/lib/`의 순수 함수를 검증하는 데는 그 이상이 필요 없기 때문이다.

::: info [용어 풀이] 테스트 러너
"이 입력에는 이 결과가 나와야 한다"고 미리 적어 둔 검사 코드들을 자동으로 찾아 한꺼번에 실행하고, 통과와 실패를 정리해 보고해 주는 프로그램이다.
채점 기준표를 주면 답안을 대신 채점해 주는 채점기에 해당한다.
코드를 고칠 때마다 이 채점을 다시 돌리면, 예전에 되던 기능이 망가졌는지를 사람이 일일이 확인하지 않아도 된다.
:::

실제 테스트를 보자.
아래는 `rowToCard`가 CSV 행을 카드로 제대로 바꾸는지 확인하는 테스트다.

`src/lib/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowToCard } from "./csv";

describe("rowToCard", () => {
  it("maps a full row", () => {
    const card = rowToCard({
      text: " serendipity ",
      meaning: "우연한 행운",
      type: "word",
      tags: "명사|고급",
      // ...
    });
    expect(card).toEqual({
      text: "serendipity",
      meaning: "우연한 행운",
      cardType: "word",
      tags: ["명사", "고급"],
      // ...
    });
  });

  it("rejects rows missing text or meaning", () => {
    expect(rowToCard({ text: "hello" })).toBeNull();
    expect(rowToCard({ meaning: "뜻" })).toBeNull();
    expect(rowToCard({ text: "  ", meaning: "뜻" })).toBeNull();
  });
});
```

`describe`로 대상 함수를 묶고 `it`으로 개별 시나리오를 서술하는 구조다.
6장에서 본 Go의 테이블 주도 테스트와 형태는 다르지만, 입력과 기대 출력을 나열한다는 본질은 같다.
공백 트리밍, 필수 필드 누락, legacy 헤더 호환 같은 경계 조건이 시나리오 이름으로 문서화된다.

사전 응답 매핑 테스트도 같은 구조다.

`src/lib/dictionary.test.ts`:

```ts
it("handles empty responses", () => {
  const entry = mapEntries([]);
  expect(entry).toEqual({ phonetic: null, definition: null, example: null });
});
```

`lookupWord` 전체가 아니라 순수 함수 `mapEntries`만 테스트한다는 점이 앞 절에서 말한 분리의 결실이다.
네트워크를 모킹(mocking)할 필요 없이, 외부 API가 보낼 법한 JSON 조각을 그대로 인자로 넘기면 된다.
빈 응답, 발음 기호 누락 같은 외부 API의 변덕을 테스트 케이스로 고정해 두면, 회귀(regression)를 기계가 감시해 준다.
실행은 `npm test` 한 줄이다.

### ESLint: 이 프로젝트에는 없다, 그러나

먼저 밝혀 둘 것이 있는데, 이 저장소에는 ESLint가 설정돼 있지 않다.
`package.json`에 eslint 의존성이 없고 설정 파일도 없다.

ESLint는 타입 검사가 다루지 않는 영역을 짚는 정적 분석(static analysis) 도구다.
타입은 맞지만 의심스러운 코드, 예컨대 사용하지 않는 변수, `await`를 빠뜨린 Promise, React 훅의 의존성 배열 누락 같은 것을 잡는다.
특히 마지막 항목을 잡는 `eslint-plugin-react-hooks`는 React 개발에서 실질적인 버그 예방 효과가 크다.

그런데 왜 없는가.
이 프로젝트의 코드는 대부분 AI 에이전트가 생성하고, strict 모드의 `tsc`와 vitest, 그리고 Next.js 빌드가 검증 게이트로 이미 돌고 있다.
1인 개발의 작은 코드베이스에서는 이 조합만으로도 잡히는 문제가 대부분이었고, 린트 규칙 설정과 유지에 드는 비용을 아꼈다는 것이 현재 상태의 솔직한 배경이다.

그렇다면 도입 판단 기준을 정리해 보자.
첫째, 협업 인원이 늘어나면 도입 가치가 급격히 커진다.
스타일과 관용구를 리뷰에서 말로 지적하는 대신 도구가 강제하는 편이 싸기 때문이다.
둘째, React 훅 사용이 복잡해지면(커스텀 훅 다수, 의존성 배열이 긴 effect) `react-hooks` 규칙만이라도 켜는 것이 안전하다.
셋째, 에이전트 생성 코드의 비중이 높다면 린트는 또 하나의 자동 피드백 신호가 되어 사람의 검토 부담을 줄인다.
도입한다면 Next.js가 제공하는 `eslint-config-next` 프리셋에서 시작해 필요한 규칙만 더하는 것이 무난하다.

## 정리

이번 장에서 살펴본 내용을 정리해 보자.

첫째, Promise는 "나중에 결과를 주겠다"는 약속을 담은 객체로 대기, 이행, 거부의 세 상태를 오가고, async/await는 이 Promise를 위에서 아래로 읽히는 코드로 다루게 해 준다.
오류는 try/catch로 받되 `WordNotFoundError`처럼 성격이 다른 실패는 클래스로 구분하고, 상태 해제 같은 뒷정리는 finally에 둔다.
콜백만 주는 라이브러리는 `parseCsv`처럼 `new Promise`로 감싸 같은 세계로 편입시킨다.

둘째, 타입은 컴파일하면 사라지므로 신뢰 경계를 넘는 데이터(제삼자 API, CSV, URL)는 런타임 검증이 필요하다.
현재는 `rowToCard`, `decodeRule` 같은 손 검증이며, zod는 의존성만 선언된 상태다.
경계에는 스키마 검증, 내부에는 타입 공유라는 기준을 세웠다.
검사 없는 `as` 단언은 컴파일러를 침묵시킬 뿐이므로, 단언 곁에는 그것을 정당화하는 런타임 근거가 있어야 한다.

셋째, `src/lib/`의 순수 로직 모듈(csv, dictionary, rules)은 React 없이 동작하므로 vitest로 값싸게 테스트된다.
strict 모드 `tsconfig.json`과 `tsc --noEmit`, vitest가 이 프로젝트의 품질 게이트이고, ESLint는 협업 확대나 훅 복잡도 증가 시점에 도입할 후보로 남겨 두었다.

다음 10장과 11장에서는 이 타입과 로직 위에서 화면을 만드는 React와 Next.js를 다룬다.
`api<T>`가 TanStack Query와 만나고, `parseCsv`가 가져오기 다이얼로그와 만나는 장면을 보게 될 것이다.
