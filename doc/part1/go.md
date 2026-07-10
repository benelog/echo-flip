# 5장 Go 코드 읽기: 구조체, 포인터, 에러 처리

4장에서 Go 코드가 담기는 틀(모듈과 디렉터리)과 변수, 함수, 제어문, 상수를 익혔다.
이 장에서는 그 기초를 들고 Echo Flip의 실제 도메인 코드 속으로 들어간다.

중심 예제는 간격 반복(Spaced Repetition) 알고리즘을 구현한 internal/srs 패키지다.
암기 카드 앱의 심장에 해당하는 이 코드로 구조체와 제로값을 익힌다.
이어서 스마트 덱 규칙을 다루는 internal/smartrules와 DB 접근 계층인 internal/store로 넘어가, 에러 처리 관례와 포인터, 슬라이스와 맵, 문자열 처리, JSON 직렬화까지 확인한다.
이 장을 읽고 나면 이 저장소의 어느 Go 파일을 열어도 문장 단위로 따라갈 수 있을 것이다.

## 간격 반복 알고리즘 읽기

이제 실제 코드다.
중심 예제인 internal/srs/srs.go는 암기 카드 앱의 심장인 간격 반복 알고리즘, 그중에서도 널리 쓰이는 SM-2의 변형을 구현한 파일인데, 전체가 49줄이라 한 장의 예제로 알맞다.

SM-2는 카드를 복습할 때마다 "얼마나 잘 기억했는지"에 따라 다음 복습까지의 간격을 늘리거나 줄이는 알고리즘이다.
Echo Flip의 UI는 맞음/틀림 두 버튼만 제공하므로, 원래 0~5점인 SM-2의 품질 점수를 5점(맞음)과 2점(틀림)에 대응시킨 이진 변형을 쓴다.

### 패키지 선언과 SM-2 상수

파일의 앞부분부터 보자.
패키지 선언, 임포트, 그리고 알고리즘이 쓰는 상수들이 차례로 나온다.

```go
package srs

import (
	"math"
	"time"
)

const (
	MinEase     = 1.3
	InitialEase = 2.5
	// SM-2 ease deltas for q=5 and q=2.
	easeGainCorrect   = 0.1
	easeLossIncorrect = 0.32
)
```

모든 Go 파일은 `package` 선언으로 시작하고, 같은 디렉터리의 파일은 같은 패키지에 속한다.
`import` 블록에는 이 파일이 쓰는 패키지를 나열하는데, 쓰지 않는 임포트는 컴파일 에러가 난다.

`const` 블록에는 4장에서 본 공개 규칙이 그대로 적용된다.
`MinEase`와 `InitialEase`는 대문자라 패키지 밖에 공개되고, `easeGainCorrect`와 `easeLossIncorrect`는 소문자라 알고리즘 내부에만 머문다.

상수 각각의 의미를 짚어 두자.
`InitialEase`(2.5)는 새 카드가 출발하는 용이도, 즉 복습 간격을 늘려 가는 배율이고, `MinEase`(1.3)는 용이도가 내려갈 수 있는 하한이다.
`easeGainCorrect`(0.1)는 정답 한 번에 용이도가 올라가는 폭, `easeLossIncorrect`(0.32)는 오답 한 번에 깎이는 폭이다.
0.1과 0.32는 임의로 고른 숫자가 아니라, SM-2의 용이도 공식에 품질 점수 5(맞음)와 2(틀림)를 대입하면 나오는 증감 폭이다.
이렇게 이름을 붙여 한곳에 모아 둔 덕에, 곧 읽을 알고리즘 본체에서 숫자의 의미를 이 블록으로 되짚어 볼 수 있다.

### 구조체와 제로값

카드 하나의 학습 상태는 구조체(Struct)로 표현한다.

```go
type State struct {
	EaseFactor   float64
	IntervalDays float64
	Repetitions  int
}

func NewState() State {
	return State{EaseFactor: InitialEase}
}
```

구조체는 필드를 묶은 값 타입으로, `EaseFactor`(용이도)는 간격이 늘어나는 배율, `IntervalDays`는 다음 복습까지의 간격(일), `Repetitions`는 연속 정답 횟수다.

::: info [용어 풀이] 구조체(struct)
여러 값에 각각 이름표를 붙여 하나로 묶은 데이터 꾸러미다.
카드 한 장의 상태를 "용이도·간격·정답 횟수"로 따로 들고 다니는 대신, `State`라는 상자 하나에 담아 함께 다룬다.
서류 양식의 빈칸들처럼 각 칸(필드)마다 이름과 담을 값의 종류가 정해져 있다.
:::

`NewState`는 생성자 관례를 보여 준다.
Go에는 생성자 문법이 없고, `New`로 시작하는 일반 함수를 관례로 쓴다.
여기서 주목할 것은 `State{EaseFactor: InitialEase}`가 `EaseFactor`만 지정한다는 점이다.
4장에서 본 대로 초기화하지 않은 값은 타입별 제로값(Zero Value)을 가지므로, `IntervalDays`와 `Repetitions`는 자동으로 `0`이 된다.
그리고 이것이 "아직 한 번도 복습하지 않은 카드"라는 의미와 정확히 일치한다.
제로값이 곧 유효한 초기 상태가 되도록 타입을 설계하는 것이 Go다운 방식이다.

### 다중 반환과 알고리즘 본체

이제 핵심인 `Grade` 함수다.
카드를 맞혔는지에 따라 다음 복습 상태와 복습 시각을 계산해 돌려주는, internal/srs/srs.go의 나머지 절반이다.

```go
// Grade returns the next SRS state and due time after a first-pass answer.
// Retry-round answers must not be graded.
func Grade(s State, correct bool, now time.Time) (State, time.Time) {
	if correct {
		s.Repetitions++
		switch s.Repetitions {
		case 1:
			s.IntervalDays = 1
		case 2:
			s.IntervalDays = 6
		default:
			s.IntervalDays = math.Round(s.IntervalDays * s.EaseFactor)
		}
		s.EaseFactor += easeGainCorrect
	} else {
		s.Repetitions = 0
		s.IntervalDays = 1
		s.EaseFactor = math.Max(MinEase, s.EaseFactor-easeLossIncorrect)
	}
	due := now.Add(time.Duration(s.IntervalDays * float64(24*time.Hour)))
	return s, due
}
```

시그니처부터 보자.
`func Grade(s State, correct bool, now time.Time) (State, time.Time)`는 갱신된 상태와 다음 복습 시각, 값 두 개를 반환한다.
4장에서 다중 반환은 "결과와 에러"의 짝으로 만났는데, 여기서는 실패할 일이 없는 계산이라 에러 대신 서로 붙어 다니는 결과 두 개를 함께 돌려주는 데 쓰였다.

알고리즘을 단계별로 따라가 보자.

정답(`correct == true`)이면 연속 정답 횟수를 하나 올리고 `switch`로 분기한다.
첫 정답이면 1일 뒤, 두 번째 연속 정답이면 6일 뒤에 다시 본다.
세 번째부터는 직전 간격에 용이도를 곱해 간격을 늘린다.
초기 용이도가 2.5이므로 간격은 대략 1일 → 6일 → 16일 → 45일로 벌어진다.
기억이 굳을수록 복습 빈도를 기하급수적으로 줄이는 것이 간격 반복의 핵심 아이디어다.
정답을 맞힐 때마다 용이도도 0.1씩 올라가서, 잘 외워지는 카드일수록 간격이 더 빨리 벌어진다.
4장에서 본 대로 각 `case`는 자동으로 끝나므로 `break` 없이 깔끔하게 읽힌다.

오답이면 처벌이 확실하다.
연속 정답 횟수를 0으로 되돌리고 간격도 1일로 초기화해, 처음부터 다시 외우게 한다.
용이도는 0.32만큼 깎되 `math.Max(MinEase, ...)`로 하한 1.3을 지킨다.
하한이 없으면 자주 틀리는 카드의 간격이 영원히 늘어나지 못하는 "용이도 지옥(ease hell)"에 빠지기 때문이다.

한 가지 더 눈여겨볼 점은 `s State`가 포인터가 아닌 값으로 전달된다는 것이다.
함수 안에서 `s.Repetitions++`처럼 수정해도 호출자의 원본에는 영향이 없고, 수정된 복사본이 반환값으로 돌아간다.
입력을 바꾸지 않고 새 상태를 돌려주는 순수 함수(Pure Function)이므로 테스트하기 쉽다.
현재 시각을 `time.Now()`로 직접 얻지 않고 `now` 인자로 받는 것도 같은 이유인데, 6장에서 테스트를 읽으며 효과를 확인하겠다.

::: info [용어 풀이] 순수 함수(Pure Function)
입력을 건드리지 않고, 같은 입력에는 언제나 같은 결과만 내놓는 함수다.
계산기처럼 같은 숫자를 넣으면 늘 같은 답이 나오는 것과 같아서 동작을 예측하기 쉽다.
현재 시각 같은 바깥 세계마저 인자로 받아 오면 언제 실행해도 결과가 같으므로, 테스트가 한결 수월해진다.
:::

### time 패키지

`Grade`의 마지막 두 줄, 특히 `due := now.Add(time.Duration(s.IntervalDays * float64(24*time.Hour)))`는 `time` 패키지의 사용법을 압축해 보여 준다.
`time.Time`은 특정 시각, `time.Duration`은 시간의 길이를 나타낸다.
`Duration`의 실체는 나노초 단위의 정수(int64)이고, `time.Hour` 같은 상수가 미리 정의되어 있어 `24*time.Hour`라고 쓰면 하루가 된다.
Go는 숫자 타입 간 암묵적 변환을 허용하지 않으므로, `float64`인 `IntervalDays`와 곱하기 위해 `float64(24*time.Hour)`로 변환했다가 결과를 다시 `time.Duration`으로 되돌린다.
장황해 보이지만, 단위가 다른 숫자가 소리 없이 섞이는 사고를 컴파일 단계에서 막아 준다.

## 에러 처리: 반환값으로서의 error

`Grade`는 실패할 일이 없는 순수 계산이라 에러를 반환하지 않는다.
실패할 수 있는 함수의 모양은 internal/smartrules/rules.go에서 볼 수 있다.
이 패키지는 "오답률 높은 카드", "오래 안 본 카드" 같은 조건으로 카드를 골라 주는 가상의 스마트 덱 규칙을 다룬다.
아래 `Parse`는 규칙을 적은 JSON 텍스트를 해석해 `Rule` 값으로 바꾸는 함수다.

```go
func Parse(raw []byte) (Rule, error) {
	var r Rule
	if err := json.Unmarshal(raw, &r); err != nil {
		return r, fmt.Errorf("invalid rule json: %w", err)
	}
	return r, r.Validate()
}
```

4장에서 본 관례가 그대로 나온다.
실패할 수 있는 함수는 마지막 반환값으로 `error` 타입을 돌려주고, 호출자는 그 값이 `nil`인지 즉시 검사한다.
`if err := json.Unmarshal(raw, &r); err != nil { ... }`는 이 관례의 표준형으로, `if` 문 안에서 변수 선언과 조건 검사를 한 번에 한다.
`fmt.Errorf`의 `%w` 동사는 원인 에러를 감싸(wrap) 맥락을 덧붙이면서도 원인을 보존하는 새 에러를 만든다.

미리 정의해 두고 재사용하는 센티널 에러(Sentinel Error) 패턴도 있다.
internal/store/store.go에서 발췌했다.

```go
var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
}
```

`ErrNotFound`는 "요청한 행이 없다"를 뜻하는 패키지 공용 에러 값이다.
internal/store/decks.go에서는 DB 드라이버의 에러를 이 값으로 번역한다.

```go
	err := row.Scan(&d.ID, &d.Name, &d.Description, &d.CardCount,
		&d.ShareSlug, &d.SharedAt, &d.CreatedAt, &d.UpdatedAt, &seq)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNotFound
	}
```

`errors.Is`는 감싸진 에러 사슬을 따라가며 특정 에러인지 판별한다.
HTTP 핸들러는 `store.ErrNotFound`를 받으면 404로 응답하는데, 이 연결은 7장에서 확인한다.

## 포인터

### 값의 복사와 주소

지금까지 함수에 값을 넘길 때 일어나는 일을 당연하게 지나쳤는데, 여기서 확실히 해 두자.
Go에서 함수의 인자는 복사되어 전달된다.
`Grade`가 받은 `s`는 호출자가 가진 `State`의 복사본이었고, 함수 안에서 아무리 고쳐도 원본이 멀쩡했던 이유다.

그런데 복사본이 아니라 원본 그 자체를 함수에게 맡겨야 할 때가 있다.
이럴 때는 값을 통째로 넘기는 대신, 그 값이 메모리 어디에 있는지를 알려 주는 주소를 넘긴다.
이 주소를 담는 값이 포인터(Pointer)다.

::: info [용어 풀이] 포인터(Pointer)
값 자체가 아니라 그 값이 저장된 위치(주소)를 담는 변수다.
집을 통째로 옮기는 대신 집 주소를 적은 쪽지를 건네는 것과 같아서, 쪽지를 받은 쪽은 그 주소로 찾아가 원본 집을 고칠 수 있다.
아무 곳도 가리키지 않는 빈 쪽지 상태는 nil로 표현한다.
:::

문법은 기호 두 개가 전부다.
`&x`는 변수 `x`의 주소를 얻고, 포인터 `p`에 대해 `*p`는 그 주소에 있는 값을 가리킨다.
타입 이름 앞에 붙은 `*`(예: `*Config`, `*Rule`)는 "그 타입의 값을 가리키는 포인터"라는 뜻이다.

방금 본 `Parse`의 `json.Unmarshal(raw, &r)`이 좋은 예다.
`json.Unmarshal`은 JSON을 해석한 결과를 호출자의 변수에 채워 넣어야 하는 함수다.
`r`을 값으로 넘기면 함수는 복사본만 채우고, 정작 원본 `r`은 빈 채로 남는다.
그래서 `&r`로 주소를 넘겨 "이 주소에 있는 원본을 채워 달라"고 알려 준다.

4장 config.go의 `Load`가 반환하던 `*Config`도 이제 읽을 수 있다.
설정 구조체를 통째로 복사해 돌려주는 대신 그것이 놓인 주소 하나를 건네고, 실패했을 때는 "가리키는 것이 없음"인 `nil`을 돌려주기 위한 선택이다.

### 수정 의도를 드러내는 포인터 리시버

앞서 `Grade`는 `State`를 값으로 받았다.
반면 rules.go의 `Validate`는 포인터로 받는다.

```go
func (r *Rule) Validate() error {
	if r.Limit <= 0 || r.Limit > 200 {
		r.Limit = 20
	}
	switch r.Type {
	case HighError:
		if r.MinAttempts <= 0 {
			r.MinAttempts = 3
		}
		// ...
	case Tag:
		if len(r.Tags) == 0 {
			return fmt.Errorf("tag rule requires tags")
		}
	// ...
	}
	return nil
}
```

함수명 앞의 `(r *Rule)`을 리시버(Receiver)라고 하며, 이 함수가 `Rule` 타입의 메서드임을 뜻한다.
리시버가 `*Rule` 포인터이므로 메서드 안에서 `r.Limit = 20`처럼 필드를 고치면 호출자의 원본이 바뀐다.
`Validate`는 검증만 하는 것이 아니라 빠진 값에 기본값을 채워 넣는 역할이라 원본 수정이 필요하다.
같은 파일의 `Query` 메서드는 규칙을 읽기만 하므로 값 리시버 `(r Rule)`을 쓴다.
포인터 리시버는 "이 메서드는 상태를 바꾼다"는 신호가 되므로, 시그니처만 봐도 부수 효과 여부를 알 수 있다.

### 값의 부재를 나타내는 포인터

포인터의 또 다른 용도는 "값이 없음"의 표현이다.
internal/store/decks.go의 `Deck` 구조체를 보자.

```go
type Deck struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	// ...
	SharedAt    *time.Time `json:"sharedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
}
```

`Description`이 `string`이 아니라 `*string`인 이유는 DB의 NULL을 표현하기 위해서다.
값 타입 `string`의 제로값은 빈 문자열이라 "설명이 빈 문자열"과 "설명이 없음"을 구별할 수 없다.
포인터라면 `nil`이 "없음"을 뜻하고, JSON으로 직렬화하면 `null`이 된다.
필드 뒤의 `` `json:"description"` ``은 구조체 태그(Struct Tag)로, JSON 직렬화 시 필드 이름을 지정하는 메타데이터다.
이 태그는 이 장의 마지막 절에서 다시 만난다.

## 슬라이스와 맵

Go에서 일상적으로 쓰는 컬렉션 타입은 슬라이스(Slice)와 맵(Map) 둘이다.
슬라이스는 가변 길이 배열인데, internal/store/decks.go의 `ListDecks`가 전형적인 사용 패턴을 보여 준다.

```go
func (s *Store) ListDecks(ctx context.Context, userID uuid.UUID) ([]Deck, error) {
	rows, err := s.pool.Query(ctx, deckSelect+` where d.user_id = $1 order by d.created_at desc`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	decks := []Deck{}
	for rows.Next() {
		d, err := scanDeck(rows)
		if err != nil {
			return nil, err
		}
		decks = append(decks, d)
	}
	return decks, rows.Err()
}
```

`decks := []Deck{}`로 빈 슬라이스를 만들고, `append`로 원소를 덧붙인다.
여기서 `decks = append(decks, d)`처럼 결과를 반드시 다시 받는 것이 중요하다.
슬라이스의 실체는 "내부 배열의 위치, 현재 길이, 최대 용량"을 담은 작은 값이다.
`append`는 용량에 여유가 있으면 그 자리에 덧붙이지만, 배열이 가득 찼으면 더 큰 배열을 새로 마련해 기존 원소를 옮겨 담고 그 새 배열을 가리키는 슬라이스를 돌려준다.
어느 쪽이 일어날지 호출하는 쪽에서는 알 수 없으므로, 반환값을 다시 받지 않으면 새 배열로 이사한 경우의 추가분을 잃어버린다.

`defer rows.Close()`의 `defer`는 함수가 어떤 경로로 반환되든 마지막에 실행할 정리 작업을 예약하는 키워드로, 중간의 `return nil, err`에서도 커서가 확실히 닫힌다.

맵은 키-값 저장소다.
internal/store/cards.go에서 CSV 대량 등록 시 중복 카드를 걸러내는 데 쓴다.

```go
	seen := map[string]bool{}
	// ...
	for rows.Next() {
		var f string
		// ...
		seen[f] = true
	}
```

`map[string]bool`은 문자열 키에 불리언 값을 가지는 맵이다.
기존 카드의 정규화된 텍스트를 `seen`에 넣어 두고, 새 카드를 넣기 전에 존재 여부를 확인하는 집합(Set) 용도다.

슬라이스와 맵이 함께 일하는 장면은 같은 파일의 `CardsByRule` 마지막 부분에 있다.
스마트 규칙으로 고른 카드 ID 목록(`ids`)의 순서에 맞춰, DB에서 읽어 온 카드들(`cards`)을 재정렬하는 코드다.

```go
	byID := make(map[uuid.UUID]Card, len(cards))
	for _, c := range cards {
		byID[c.ID] = c
	}
	ordered := make([]Card, 0, len(cards))
	for _, id := range ids {
		if c, ok := byID[id]; ok {
			ordered = append(ordered, c)
		}
	}
	return ordered, nil
```

`make`는 슬라이스나 맵을 크기를 지정해 만드는 내장 함수다.
`make([]Card, 0, len(cards))`는 길이 0, 용량 `len(cards)`인 슬라이스, 즉 아직 비었지만 카드 수만큼 자리를 예약해 둔 슬라이스를 만든다.
덧붙일 개수를 미리 알기 때문에 용량을 예약했고, 이어지는 `append`는 예약된 자리를 채우기만 하므로 앞서 말한 배열 이사가 일어나지 않는다.

`if c, ok := byID[id]; ok`는 맵 조회의 comma-ok 관용구다.
맵에서 키를 읽으면 값과 함께 "그 키가 실제로 있었는지"를 두 번째 반환값(불리언)으로 받을 수 있다.
없는 키를 읽어도 에러가 나지 않고 제로값이 나오기 때문에, "값이 마침 제로값인 것"과 "키가 아예 없는 것"을 구별하려면 이 두 번째 값이 필요하다.

슬라이스가 구조체 필드로 쓰이는 예는 rules.go의 `Rule` 타입에서 볼 수 있다.

```go
type Rule struct {
	Type            RuleType `json:"type"`
	MinAttempts     int      `json:"minAttempts,omitempty"`
	// ...
	Tags            []string `json:"tags,omitempty"`
	Limit           int      `json:"limit,omitempty"`
}
```

`Tags []string`은 문자열 슬라이스 필드이고, 제로값은 `nil` 슬라이스다.
`len(nil 슬라이스)`는 0이므로 `Validate`의 `len(r.Tags) == 0` 검사는 태그가 아예 없는 경우까지 자연스럽게 처리한다.
`RuleType`은 문자열에 이름을 붙인 사용자 정의 타입으로, `HighError`, `Stale` 같은 상수와 함께 열거형처럼 쓰는 Go의 관용구다.

## 문자열 처리

문자열을 자르고 다듬고 잇는 일상적인 조작은 표준 라이브러리 `strings` 패키지가 담당한다.
4장 config.go에서 이미 쉼표로 자르는 `strings.Split`과 앞뒤 공백을 걷어 내는 `strings.TrimSpace`를 봤다.
도메인 코드에서 두 가지 쓰임을 더 보자.

첫 번째는 중복 카드 판정이다.
CSV로 카드를 대량 등록할 때 "hello"와 " Hello "를 다른 카드로 취급하면 같은 단어가 두 장 생긴다.
internal/store/cards.go의 `BulkCreateCards`는 카드 텍스트를 비교용 열쇠로 정규화해 이 문제를 막는다.

```go
	for _, in := range inputs {
		key := strings.ToLower(strings.TrimSpace(in.Text))
		if key == "" || seen[key] {
			res.Skipped++
			continue
		}
		seen[key] = true
		// ...
	}
```

`strings.TrimSpace`로 앞뒤 공백을 걷어 내고 `strings.ToLower`로 소문자로 통일하면, 표기만 다른 같은 텍스트가 같은 `key`로 모인다.
앞 절에서 본 `seen` 맵이 걸러내는 열쇠가 바로 이렇게 만들어진다.
`continue`는 반복문의 이번 회차를 건너뛰고 다음 회차로 넘어가는 키워드로, 중복이나 빈 텍스트는 등록하지 않고 건너뛴 개수만 센다.

두 번째는 목록을 한 줄로 잇는 반대 방향의 조작이다.
덱을 CSV 파일로 내보낼 때는 카드 한 장의 태그 목록을 한 칸에 담아야 한다.
internal/handlers/cards.go에서 카드 하나를 CSV 한 행으로 쓰는 부분이다.

```go
	for _, card := range cards {
		w.Write([]string{
			card.Text, card.Meaning, card.CardType,
			strings.Join(card.Tags, "|"), deref(card.Phonetic), deref(card.Example),
		})
	}
```

`strings.Join(card.Tags, "|")`는 태그 슬라이스를 `|` 문자로 이어 `verb|basic`처럼 하나의 문자열로 만든다.
CSV의 칸 구분자인 쉼표와 겹치지 않는 문자를 구분자로 골랐다.
자르기(Split), 다듬기(TrimSpace), 잇기(Join), 대소문자 통일(ToLower)까지, 문자열에 하고 싶은 일은 대부분 `strings` 패키지에 이미 함수로 준비되어 있다.

## JSON 직렬화

Echo Flip에서 프런트엔드와 백엔드가 데이터를 주고받을 때, 그리고 스마트 덱 규칙을 DB에 저장할 때의 공용 표기법은 JSON이다.
구조체처럼 메모리 안에 있는 데이터 꾸러미를 전송하고 저장할 수 있는 한 줄의 글로 바꿔 적는 일을 직렬화(Serialization)라고 하고, 그 글을 다시 데이터로 되살리는 반대 방향을 역직렬화라고 한다.
표준 라이브러리 `encoding/json`이 양방향을 모두 맡는다.

읽기 방향, 즉 JSON 텍스트를 구조체로 되살리는 함수가 `json.Unmarshal`이다.
에러 처리 절에서 본 rules.go의 `Parse`를 다시 보자.

```go
func Parse(raw []byte) (Rule, error) {
	var r Rule
	if err := json.Unmarshal(raw, &r); err != nil {
		return r, fmt.Errorf("invalid rule json: %w", err)
	}
	return r, r.Validate()
}
```

`json.Unmarshal`은 JSON 텍스트(`raw`)를 해석해 구조체 `r`의 필드에 채워 넣는다.
어느 JSON 키를 어느 필드에 넣을지는 포인터 절의 `Deck`에서 본 구조체 태그(`` `json:"..."` ``)가 알려 준다.

쓰기 방향이 `json.Marshal`이다.
internal/handlers/smart.go에서 스마트 덱을 저장하기 전, 규칙을 정돈된 JSON으로 다시 만드는 부분이다.

```go
	rule, err := smartrules.Parse(body.Rule)
	if err != nil {
		badRequest(c, err.Error())
		return
	}
	normalized, _ := json.Marshal(rule)
```

사용자가 보낸 규칙 JSON을 `Parse`로 해석하면, 그 안의 `Validate`가 빠진 값에 기본값을 채운다.
그 결과 구조체를 `json.Marshal`로 다시 JSON 텍스트로 바꾸면 기본값까지 명시된 정돈된 형태가 되고, 이것을 DB에 저장한다.
JSON을 읽고, 고치고, 다시 쓰는 왕복에 함수 두 개면 충분하다.
`json.Marshal`도 에러를 반환하지만, 방금 만든 규칙 구조체의 직렬화는 실패할 수 없으므로 여기서는 `_`로 버렸다.

한 가지 미리 밝혀 두면, HTTP 요청과 응답에 담긴 JSON의 변환은 이 함수들을 직접 부르는 대신 웹 프레임워크 Gin이 대신해 준다.
7장에서 `c.ShouldBindJSON`과 `c.JSON`이라는 이름으로 다시 만나게 된다.

## 정리

첫째, 49줄의 `internal/srs/srs.go` 하나로 구조체와 제로값, 다중 반환, 값 전달, time 패키지를 확인했다.
제로값이 곧 유효한 초기 상태가 되도록 타입을 설계하고, 현재 시각마저 인자로 받는 순수 함수로 만들어 동작을 예측 가능하게 했다.

둘째, 에러는 예외가 아닌 값이다.
실패할 수 있는 함수는 `error`를 반환하고(`%w` 래핑), 패키지 공용 센티널 에러(`ErrNotFound`)는 `errors.Is`로 판별한다.

셋째, 포인터는 값의 주소를 담는 값이며 세 가지 쓰임을 봤다.
함수가 원본을 채우게 하고(`&r`), 메서드의 수정 의도를 드러내고(`*Rule` 리시버), 값의 부재를 표현한다(`*string`과 `nil`).

넷째, 슬라이스와 맵이 Go의 컬렉션을 담당한다.
`append`는 결과를 반드시 다시 받고, 개수를 미리 알면 `make`로 용량을 예약하며, 맵 키의 존재는 comma-ok로 확인한다.

다섯째, `strings`와 `encoding/json` 같은 표준 라이브러리가 문자열 정규화, CSV 내보내기, JSON 왕복 같은 일상 작업을 담당한다.
바깥 의존성 없이 표준 라이브러리만으로 이만큼 해결되는 것이 Go의 두터운 기본기다.

이 장에서 읽은 코드가 정말 설계대로 동작하는지는 어떻게 확신할까.
다음 장에서는 그 답인 테스트와 품질 검사 도구를 다룬다.
SRS 알고리즘과 덱 슬러그 인코딩의 실제 테스트를 읽으며, 이 안전망이 AI 에이전트와의 협업에서 어떤 역할을 하는지도 확인해 보자.
