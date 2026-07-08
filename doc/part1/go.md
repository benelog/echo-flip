# 2장 Go — 작은 서버를 위한 백엔드 언어

Echo Flip의 백엔드 API는 Go(고)로 작성해 Vercel 서버리스 함수(Serverless Function)로 배포한다.
Go를 선택한 이유는 1장에서 정리했다.
이 장에서는 그 Go를 실제로 읽고 쓸 수 있도록, 먼저 Go 모듈과 디렉터리 관례를 이 저장소의 실제 배치로 확인한다.
이어서 간격 반복(Spaced Repetition) 알고리즘을 구현한 `internal/srs` 패키지를 중심 예제로 삼아 구조체, 다중 반환과 에러 처리, 포인터 같은 문법 기초를 실제 코드로 익힌다.
마지막으로 테이블 주도 테스트(Table-driven Test)와 품질 검사 도구가 AI 에이전트와의 협업에서 어떤 역할을 하는지 살펴보겠다.

## Go 모듈과 패키지

언어를 골랐으니 코드를 어떻게 담을지 정할 차례다.
Go의 코드 단위는 패키지(Package)이고, 패키지들을 버전 관리하는 단위가 모듈(Module)이다.

### go.mod와 임포트 경로

모듈의 정의는 저장소 루트의 go.mod 파일 하나로 끝난다.

```go
module github.com/benelog/echo-flip

go 1.26.4

require (
	github.com/MicahParks/keyfunc/v3 v3.8.0
	github.com/gin-contrib/cors v1.7.7
	github.com/gin-gonic/gin v1.12.0
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/golang-migrate/migrate/v4 v4.19.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.10.0
)
// ... 간접(indirect) 의존성 생략
```

첫 줄의 `module` 선언이 이 모듈의 경로이자 임포트 경로의 접두어다.
예를 들어 `internal/srs` 패키지를 쓰려면 `import "github.com/benelog/echo-flip/internal/srs"`라고 쓴다.
경로가 GitHub 주소와 같은 이유는 Go가 별도의 중앙 패키지 저장소 없이 소스 저장소 URL을 그대로 패키지 좌표로 쓰기 때문이다.

`go 1.26.4`는 이 모듈이 요구하는 Go 버전이다.
`require` 블록에는 JWT 검증(keyfunc, golang-jwt), 웹 프레임워크(gin), DB 드라이버(pgx) 등 직접 의존성 일곱 개가 전부인데, 이 적은 수 자체가 표준 라이브러리의 두터움을 보여 준다.

### 표준 디렉터리 관례: cmd, internal, pkg

Go 커뮤니티에는 강제는 아니지만 널리 통용되는 디렉터리 관례가 있고, 이 저장소도 따른다.

```text
echo-flip/
├── api/            # Vercel 서버리스 함수 진입점
├── cmd/
│   ├── migrate/    # DB 마이그레이션 실행기
│   └── server/     # 로컬 개발 서버
├── internal/
│   ├── auth/       # JWT 검증
│   ├── config/     # 환경 변수 로딩
│   ├── db/         # 마이그레이션 SQL
│   ├── handlers/   # HTTP 핸들러
│   ├── smartrules/ # 스마트 덱 규칙
│   ├── srs/        # 간격 반복 알고리즘
│   └── store/      # DB 접근 계층
├── pkg/
│   └── app/        # Gin 엔진 조립
└── src/            # Next.js 프런트엔드 (Go 아님)
```

**cmd/**는 실행 진입점, 즉 `main` 패키지를 두는 곳으로, 디렉터리 하나가 실행 파일 하나에 대응한다.
이 저장소에는 로컬 개발 서버(`cmd/server`)와 마이그레이션 실행기(`cmd/migrate`)가 있다.

cmd/server/main.go의 핵심 부분이다.

```go
import (
	"log"
	"os"

	"github.com/benelog/echo-flip/pkg/app"
)

func main() {
	engine, err := app.Engine()
	if err != nil {
		log.Fatal(err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("echo-flip api listening on :%s", port)
	if err := engine.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
```

`main` 함수가 프로그램의 시작점이고, 실제 애플리케이션 조립은 `pkg/app`에 위임한다.
진입점은 얇게 유지하고 로직은 임포트 가능한 패키지에 두는 것이 Go의 관례이며, `import` 블록의 마지막 줄에서 모듈 경로가 접두어로 쓰이는 모습도 확인할 수 있다.

**internal/**은 Go 컴파일러가 특별 취급하는 유일한 디렉터리다.
`internal/` 아래의 패키지는 같은 모듈 안에서만 임포트할 수 있고, 외부 모듈이 임포트하면 컴파일 에러가 난다.
공개 API를 최소화하고 내부 구현을 마음껏 바꿀 자유를 확보하는 장치다.

**pkg/**는 반대로 외부에 공개해도 되는 패키지를 두는 관례적 위치다.
그런데 이 저장소의 `pkg/app`은 관례 때문이 아니라 실제 제약 때문에 존재한다.
api/index.go 상단의 주석이 그 사정을 설명한다.

```go
// Vercel compiles this file outside the module, so it must not import
// internal/ packages (directly); shared code it needs lives in pkg/.
package handler
```

Vercel의 Go 런타임은 `api/` 아래 파일을 모듈 바깥에서 컴파일하므로, 이 파일에서 `internal/` 패키지를 직접 임포트할 수 없다.
그래서 Gin 엔진을 조립하는 코드를 `pkg/app`에 두고, 로컬 서버와 Vercel 함수가 같은 `app.Engine()`을 공유한다.
`internal`의 임포트 차단이 실제 플랫폼 제약과 만나 구조를 결정한 사례다.
이 조립 과정의 내부는 3장에서 다룬다.

## 문법 기초: 간격 반복 알고리즘 읽기

이제 실제 코드로 문법을 익혀 보자.
중심 예제인 internal/srs/srs.go는 암기 카드 앱의 심장인 간격 반복 알고리즘, 그중에서도 널리 쓰이는 SM-2의 변형을 구현한 파일인데, 전체가 49줄이라 한 장의 예제로 알맞다.

SM-2는 카드를 복습할 때마다 "얼마나 잘 기억했는지"에 따라 다음 복습까지의 간격을 늘리거나 줄이는 알고리즘이다.
Echo Flip의 UI는 맞음/틀림 두 버튼만 제공하므로, 원래 0~5점인 SM-2의 품질 점수를 5점(맞음)과 2점(틀림)에 대응시킨 이진 변형을 쓴다.

### 패키지, 상수, 공개 규칙

파일의 앞부분부터 보자.

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

`const` 블록의 이름들을 눈여겨보자.
`MinEase`와 `InitialEase`는 대문자로, `easeGainCorrect`와 `easeLossIncorrect`는 소문자로 시작한다.
Go에는 `public`, `private` 키워드가 없다.
식별자가 대문자로 시작하면 패키지 밖으로 공개(exported)되고, 소문자로 시작하면 패키지 안에서만 쓸 수 있다.
공개 범위가 이름에 새겨지므로 코드를 읽는 것만으로 API 표면이 보인다.

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

`NewState`는 생성자 관례를 보여 준다.
Go에는 생성자 문법이 없고, `New`로 시작하는 일반 함수를 관례로 쓴다.
여기서 주목할 것은 `State{EaseFactor: InitialEase}`가 `EaseFactor`만 지정한다는 점이다.
Go에서 초기화하지 않은 값은 타입별 제로값(Zero Value)을 가진다.
숫자는 `0`, 문자열은 `""`, 불리언은 `false`, 포인터는 `nil`이다.
따라서 `IntervalDays`와 `Repetitions`는 자동으로 `0`이 되고, 이것이 "아직 한 번도 복습하지 않은 카드"라는 의미와 정확히 일치한다.
제로값이 곧 유효한 초기 상태가 되도록 타입을 설계하는 것이 Go다운 방식이다.

### 다중 반환과 알고리즘 본체

이제 핵심인 `Grade` 함수다.
internal/srs/srs.go의 나머지 절반이다.

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
Go 함수는 여러 값을 반환할 수 있고, 이 기능이 뒤에서 볼 에러 처리 관례의 토대가 된다.

알고리즘을 단계별로 따라가 보자.

정답(`correct == true`)이면 연속 정답 횟수를 하나 올리고 `switch`로 분기한다.
첫 정답이면 1일 뒤, 두 번째 연속 정답이면 6일 뒤에 다시 본다.
세 번째부터는 직전 간격에 용이도를 곱해 간격을 늘린다.
초기 용이도가 2.5이므로 간격은 대략 1일 → 6일 → 16일 → 45일로 벌어진다.
기억이 굳을수록 복습 빈도를 기하급수적으로 줄이는 것이 간격 반복의 핵심 아이디어다.
정답을 맞힐 때마다 용이도도 0.1씩 올라가서, 잘 외워지는 카드일수록 간격이 더 빨리 벌어진다.
Go의 `switch`는 C와 달리 각 `case`가 자동으로 끝나므로 `break`를 쓸 필요가 없다.

오답이면 처벌이 확실하다.
연속 정답 횟수를 0으로 되돌리고 간격도 1일로 초기화해, 처음부터 다시 외우게 한다.
용이도는 0.32만큼 깎되 `math.Max(MinEase, ...)`로 하한 1.3을 지킨다.
하한이 없으면 자주 틀리는 카드의 간격이 영원히 늘어나지 못하는 "용이도 지옥(ease hell)"에 빠지기 때문이다.

한 가지 더 눈여겨볼 점은 `s State`가 포인터가 아닌 값으로 전달된다는 것이다.
함수 안에서 `s.Repetitions++`처럼 수정해도 호출자의 원본에는 영향이 없고, 수정된 복사본이 반환값으로 돌아간다.
입력을 바꾸지 않고 새 상태를 돌려주는 순수 함수(Pure Function)이므로 테스트하기 쉽다.
현재 시각을 `time.Now()`로 직접 얻지 않고 `now` 인자로 받는 것도 같은 이유인데, 테스트 절에서 효과를 확인하겠다.

### time 패키지

`Grade`의 마지막 두 줄, 특히 `due := now.Add(time.Duration(s.IntervalDays * float64(24*time.Hour)))`는 `time` 패키지의 사용법을 압축해 보여 준다.
`time.Time`은 특정 시각, `time.Duration`은 시간의 길이를 나타낸다.
`Duration`의 실체는 나노초 단위의 정수(int64)이고, `time.Hour` 같은 상수가 미리 정의되어 있어 `24*time.Hour`라고 쓰면 하루가 된다.
Go는 숫자 타입 간 암묵적 변환을 허용하지 않으므로, `float64`인 `IntervalDays`와 곱하기 위해 `float64(24*time.Hour)`로 변환했다가 결과를 다시 `time.Duration`으로 되돌린다.
장황해 보이지만, 단위가 다른 숫자가 소리 없이 섞이는 사고를 컴파일 단계에서 막아 준다.

### 에러 처리: 반환값으로서의 error

`Grade`는 실패할 일이 없는 순수 계산이라 에러를 반환하지 않는다.
실패할 수 있는 함수의 모양은 internal/smartrules/rules.go에서 볼 수 있다.
이 패키지는 "오답률 높은 카드", "오래 안 본 카드" 같은 조건으로 카드를 골라 주는 가상의 스마트 덱 규칙을 다룬다.

```go
func Parse(raw []byte) (Rule, error) {
	var r Rule
	if err := json.Unmarshal(raw, &r); err != nil {
		return r, fmt.Errorf("invalid rule json: %w", err)
	}
	return r, r.Validate()
}
```

Go에는 예외가 없다.
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
HTTP 핸들러는 `store.ErrNotFound`를 받으면 404로 응답하는데, 이 연결은 3장에서 확인한다.

### 포인터: 수정 의도를 드러내는 표식

앞서 `Grade`는 `State`를 값으로 받았다.
반면 rules.go의 `Validate`는 포인터(Pointer)로 받는다.

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

### 슬라이스와 맵

Go의 컬렉션 타입은 사실상 슬라이스(Slice)와 맵(Map) 둘이 전부다.
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
`append`는 용량이 부족하면 내부 배열을 늘린 새 슬라이스를 반환하므로 반드시 결과를 다시 받아야 한다.
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

## go test와 테이블 주도 테스트

Go는 테스트 러너를 언어 도구에 내장했다.
`_test.go`로 끝나는 파일에 `Test`로 시작하고 `*testing.T`를 받는 함수를 쓰면, 별도 프레임워크 없이 `go test`가 찾아 실행한다.

```bash
go test ./...                        # 모듈 전체 테스트
go test -v -run Lapse ./internal/srs # 이름이 매칭되는 테스트만 상세 출력
```

### SRS 알고리즘 테스트 읽기

internal/srs/srs_test.go에서 정답이 이어질 때의 간격 진행을 검증하는 테스트다.

```go
var now = time.Date(2026, 7, 7, 12, 0, 0, 0, time.UTC)

func TestCorrectProgression(t *testing.T) {
	s := NewState()
	// ease: 2.5→2.6→2.7→2.8; rep3: round(6×2.7)=16, rep4: round(16×2.8)=45
	wantIntervals := []float64{1, 6, 16, 45}
	for i, want := range wantIntervals {
		var due time.Time
		s, due = Grade(s, true, now)
		if s.IntervalDays != want {
			t.Fatalf("rep %d: interval = %v, want %v", i+1, s.IntervalDays, want)
		}
		wantDue := now.Add(time.Duration(want * float64(24*time.Hour)))
		if !due.Equal(wantDue) {
			t.Fatalf("rep %d: due = %v, want %v", i+1, due, wantDue)
		}
	}
	// ...
}
```

이것이 테이블 주도 테스트의 가장 단순한 형태다.
기대값 목록 `wantIntervals`를 테이블로 놓고, `for ... range` 루프가 각 행에 같은 검증을 적용한다.
케이스 추가가 테이블에 한 줄 더하는 일이 되므로, 분기마다 테스트 함수를 복제하는 것보다 유지 보수가 훨씬 쉽다.

파일 상단의 `var now = time.Date(...)`도 중요한 장치다.
`Grade`가 현재 시각을 인자로 받도록 설계했기 때문에, 테스트는 고정 시각을 주입해 언제 실행해도 같은 결과를 얻는다.
`t.Fatalf`는 실패를 보고하고 그 테스트 함수를 즉시 중단하는데, 뒤 단계가 앞 단계 결과에 의존하는 진행형 테스트라 중단이 맞다.
독립적인 검증이 이어질 때는 보고만 하고 계속 진행하는 `t.Errorf`를 쓴다.

같은 파일의 다른 테스트도 짧게 보자.

```go
func TestEaseFloor(t *testing.T) {
	s := NewState()
	for range 10 {
		s, _ = Grade(s, false, now)
	}
	if s.EaseFactor != MinEase {
		t.Fatalf("ease = %v, want floor %v", s.EaseFactor, MinEase)
	}
}
```

열 번 연속 틀려도 용이도가 하한 1.3 아래로 내려가지 않는지 확인한다.
`for range 10`은 Go 1.22부터 지원되는 정수 순회 문법으로, 인덱스가 필요 없는 n회 반복을 간결하게 쓴다.
반환값 중 필요 없는 것은 빈 식별자 `_`로 버린다.
이 파일에는 오답 시 상태 초기화를 확인하는 `TestLapseResets`도 있는데, 경계 조건(리셋, 하한)마다 테스트가 하나씩 배치된 구성을 눈여겨보자.

### 규칙 파싱 테스트와 테이블 패턴

internal/smartrules/rules_test.go에서는 입력 자체를 테이블로 놓는 패턴을 볼 수 있다.

```go
func TestQueriesBuild(t *testing.T) {
	for _, raw := range []string{
		`{"type":"high_error"}`,
		`{"type":"stale"}`,
		`{"type":"tag","tags":["verb"]}`,
		`{"type":"recent"}`,
	} {
		r, err := Parse([]byte(raw))
		if err != nil {
			t.Fatal(err)
		}
		if q, _ := r.Query(); q == "" {
			t.Fatalf("empty query for %s", raw)
		}
		// ...
	}
}
```

네 가지 규칙 타입의 JSON을 슬라이스 리터럴로 나열하고, 모든 타입이 빈 SQL을 만들지 않는지 한 루프로 검증한다.
새 규칙 타입을 추가하면 테이블에 JSON 한 줄만 더하면 된다.
같은 파일에는 기본값 채움(`TestParseDefaults`), 미지의 타입 거부(`TestParseRejectsUnknownType`), 상한 초과 시 되돌림(`TestLimitClamped`) 등 `Validate`의 분기마다 대응하는 테스트가 있다.
더 본격적인 테이블 주도 테스트가 궁금하면 덱 슬러그 인코딩의 왕복 변환을 전수 검사하는 internal/store/deckslug_test.go를 열어 보자.

### 테스트는 AI 에이전트의 검증 신호

이 테스트들은 사람을 위한 안전망인 동시에 AI 에이전트를 위한 명세다.
기대 동작이 테스트로 고정되어 있을수록 에이전트에게 맡길 수 있는 작업의 범위가 넓어지므로, 이 프로젝트는 순수 로직(srs, smartrules, 슬러그 인코딩)에 테스트를 집중 배치했다.
테스트가 AI 협업에서 갖는 의미는 7장에서 본격적으로 다루고, 테스트 실행을 강제하는 자동화는 8장에서 다룬다.

## 품질 검사 도구

Go 툴체인에는 코드 품질을 기계적으로 검사하는 도구가 함께 들어 있다.

**gofmt**는 표준 포맷터다.

```bash
gofmt -l .   # 포맷이 어긋난 파일 나열
gofmt -w .   # 제자리 수정
```

들여쓰기, 정렬, 괄호 위치를 단 하나의 표준형으로 고정하며 설정 옵션이 아예 없다.
"탭이냐 스페이스냐" 같은 논쟁이 Go 커뮤니티에 존재하지 않는 이유다.
모든 Go 코드가 같은 모양이므로 사람이든 AI든 처음 보는 코드를 읽는 비용이 줄고, diff에는 의미 있는 변경만 남는다.

**go vet**은 정적 분석기다.

```bash
go vet ./...
```

컴파일은 통과하지만 십중팔구 버그인 코드, 예컨대 `Printf` 형식 문자열과 인자의 불일치, 도달 불가능한 코드, 잘못된 구조체 태그를 잡아낸다.

**go build**는 빌드 명령이지만 그 자체로 가장 기본적인 검사다.
Go는 사용하지 않는 임포트와 지역 변수를 컴파일 에러로 처리하므로, `go build ./...` 통과만으로도 상당한 수준의 정합성이 보장된다.

**staticcheck**은 서드파티 정적 분석기로, `go vet`보다 훨씬 넓은 150여 가지 검사를 제공한다.

```bash
staticcheck ./...
```

사용되지 않는 코드, 비효율적인 관용구, 오래된 API 사용 등을 짚어 준다.
표준 도구가 아니므로 `go install`로 설치해야 하지만, Go 커뮤니티에서 사실상의 표준으로 통한다.

이 도구들은 빠르고, 결정적이고, 결과 해석에 사람의 판단이 필요 없어서 자동화의 재료로 이상적이다.
이 프로젝트에서는 AI 에이전트가 Go 파일을 수정할 때마다 훅(Hook)으로 gofmt와 go vet이 자동 실행되도록 구성했는데, 그 구조와 설계 의도는 8장에서 자세히 다룬다.

## 정리

첫째, 언어 선택은 제약 조건의 함수이며, 무료 서버리스와 AI 에이전트 주도 개발이라는 제약에서 Go가 유리했던 이유는 1장에서 정리했다.

둘째, Go의 코드 조직은 go.mod의 모듈 선언과 cmd/internal/pkg 디렉터리 관례로 이뤄진다.
특히 `internal/`의 임포트 차단은 컴파일러가 강제하며, 이 저장소에서는 Vercel이 `api/`를 모듈 밖에서 컴파일하는 제약과 만나 공유 코드를 `pkg/app`에 두는 구조로 이어졌다.

셋째, 49줄의 `internal/srs/srs.go` 하나로 구조체와 제로값, 다중 반환, 값 전달, time 패키지를 모두 확인했다.
에러는 예외가 아닌 값이며(`error` 반환, `errors.Is`, `%w` 래핑), 포인터는 원본 수정 의도(`*Rule` 리시버)와 값의 부재(`*string`)를 표현한다.

넷째, 테이블 주도 테스트는 케이스 추가를 테이블 한 줄 추가로 만드는 Go의 표준 테스트 패턴이다.
시각을 인자로 받는 설계 덕분에 테스트가 결정적이 되고, 이런 테스트는 AI 에이전트가 자신의 수정을 스스로 검증하는 신호로 작동한다.

다음 장에서는 이 Go 코드 위에서 HTTP API를 조립하는 웹 프레임워크 Gin을 다룬다.
로컬 서버와 Vercel 함수가 같은 Gin 엔진을 공유하는 구조가 어떻게 만들어지는지 확인해 보자.
