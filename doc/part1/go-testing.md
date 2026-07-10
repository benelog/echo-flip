# 4장 Go 테스트와 품질 도구

3장에서 읽은 SRS 알고리즘이나 스마트 덱 규칙이 정말 설계대로 동작하는지, 눈으로 코드를 읽는 것만으로는 확신하기 어렵다.
확인 작업을 사람 손에 맡기는 대신 검사 코드로 적어 두고 기계가 반복 실행하게 하는 것이 테스트다.

이 장에서는 먼저 Go가 테스트를 찾아 실행하는 규칙과 명령 사용법을 익힌다.
이어서 3장에서 읽은 코드들의 실제 테스트를 읽으며 테이블 주도 테스트(Table-driven Test) 패턴과 전수 검사, 경계값 검사를 확인한다.
마지막으로 gofmt, go vet 같은 품질 검사 도구를 살펴본다.
이 테스트와 도구들은 사람을 위한 안전망인 동시에, 2부에서 다룰 AI 에이전트가 자기 작업을 스스로 검증하는 신호이기도 하다.
그 연결까지 이 장에서 미리 짚어 두겠다.

## go test의 세 가지 규칙

Go는 테스트 러너를 별도 프레임워크 없이 언어 도구에 내장했고, 무엇이 테스트인지를 세 가지 규칙으로 정한다.

첫째, 테스트 코드는 파일 이름이 `_test.go`로 끝나는 파일에 담는다.
internal/srs/srs.go의 테스트는 같은 디렉터리의 internal/srs/srs_test.go에 있다.
둘째, 테스트 함수의 이름은 `Test`로 시작한다.
셋째, 테스트 함수는 `*testing.T` 타입의 매개변수 하나를 받는다.
실패 보고는 모두 이 `t`를 통해 이뤄진다.

이 규칙에 맞는 함수를 `go test` 명령이 알아서 찾아 실행한다.
`_test.go` 파일은 `go build`가 만드는 실행 파일에서 제외되므로, 테스트를 아무리 많이 써도 배포되는 서버의 크기에는 영향이 없다.

테스트 파일을 검증 대상과 같은 패키지로 선언하면, 소문자로 시작하는 비공개 식별자까지 직접 부를 수 있다.
internal/store/deckslug_test.go의 앞부분이 그 실례다.

```go
package store

import (
	"strings"
	"testing"
)

func TestDeckSlugRoundTrip(t *testing.T) {
	for _, seq := range []int64{1, 2, 35, 36, 1295, 1296, 46656, 1_000_000, 1_679_615} {
		slug := encodeDeckSlug(seq)
		// ...
	}
}
```

첫 줄이 `package store`이므로 이 테스트 파일은 store 패키지의 일원이다.
그래서 패키지 밖에는 공개되지 않은 `encodeDeckSlug`를 아무 절차 없이 직접 호출한다.
2장에서 본 공개 규칙(대문자만 공개)이 같은 패키지의 테스트에는 장벽이 되지 않는다.

## 테스트 실행 명령

테스트 실행은 `go test` 명령 하나로 끝난다.
자주 쓰는 변형은 다음과 같다.

```bash
go test ./...                              # 모듈 전체 테스트
go test ./internal/srs                     # 특정 패키지만
go test -run TestEaseFloor ./internal/srs  # 이름이 매칭되는 테스트만
go test -v ./internal/srs                  # 개별 테스트의 이름과 결과까지 상세 출력
```

`./...`은 현재 디렉터리 아래의 모든 패키지를 뜻하는 경로 패턴이다.
`-run` 뒤에는 테스트 함수 이름의 일부를 적어, 방금 고친 코드와 관련된 테스트만 골라 빠르게 돌릴 수 있다.
`-v`(verbose)는 통과한 테스트의 이름까지 하나하나 보여 준다.
평소에는 패키지별 `ok` 한 줄과 실패만 보고하다가, 무엇이 실행됐는지 확인하고 싶을 때 붙인다.

성공하면 `ok`, 실패하면 `FAIL`과 함께 실패한 검증의 메시지가 출력된다.
이 명확한 성공/실패 신호는 뒤에서 이야기할 자동화의 재료가 된다.

## SRS 알고리즘 테스트 읽기

이제 실제 테스트를 읽어 보자.
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

::: info [용어 풀이] 테이블 주도 테스트(단위 테스트 포함)
단위 테스트는 함수 하나가 기대대로 동작하는지 자동으로 확인하는 작은 검사 코드다.
테이블 주도 테스트는 그 검사를 "입력과 기대값의 목록(표)"으로 만들어, 한 번의 반복문으로 표의 모든 줄을 검사하는 방식이다.
검사할 경우를 늘리고 싶으면 표에 한 줄만 더하면 되므로, 비슷한 테스트 함수를 복사해 늘리는 것보다 관리가 쉽다.
:::

파일 상단의 `var now = time.Date(...)`도 중요한 장치다.
3장에서 `Grade`가 현재 시각을 인자로 받도록 설계한 것을 봤는데, 그 덕분에 테스트는 고정 시각을 주입해 언제 실행해도 같은 결과를 얻는다.
순수 함수 설계가 결정적인(항상 같은 결과를 내는) 테스트로 보상받는 장면이다.

실패를 보고하는 방법이 두 가지라는 것도 이 테스트에서 배울 수 있다.

| 메서드 | 하는 일 | 쓰는 상황 |
| --- | --- | --- |
| `t.Fatalf` | 실패를 보고하고 그 테스트 함수를 즉시 중단 | 뒤 검증이 앞 결과에 의존할 때 |
| `t.Errorf` | 실패를 기록하고 다음 검증을 계속 진행 | 독립적인 검증의 실패를 한 번에 모두 보고할 때 |

`TestCorrectProgression`은 두 번째 복습의 검증이 첫 번째 복습의 결과 위에서 이뤄지는 진행형 테스트라, 앞 단계가 틀리면 뒤 단계는 의미가 없다.
그래서 즉시 중단하는 `t.Fatalf`가 맞다.
서로 독립적인 검증이 이어질 때는 `t.Errorf`로 끝까지 진행해, 한 번의 실행에서 실패를 최대한 많이 수집하는 편이 낫다.

같은 파일의 다른 테스트도 짧게 보자.
오답이 거듭될 때 용이도가 어디까지 내려가는지 확인하는 테스트다.

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

## 규칙 파싱 테스트와 테이블 패턴

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

## 전수 검사와 경계값: 덱 슬러그 테스트

테이블 패턴이 가장 진지하게 쓰인 곳은 덱 슬러그 테스트다.
2장 상수 절에서 본 internal/store/deckslug.go는 덱 번호(seq)를 네 글자 슬러그로 바꾸는 `encodeDeckSlug`와 그 역변환 `decodeDeckSlug`를 담고 있다.
연속된 번호가 뻔한 슬러그로 드러나지 않도록 곱셈으로 흩뿌리는 계산이 들어 있어서, 산수가 조금이라도 어긋나면 서로 다른 덱이 같은 슬러그를 받는 사고가 난다.

이런 성질은 몇 개의 예시로 확인하는 대신 아예 전수로 검사할 수 있다.
internal/store/deckslug_test.go의 핵심 테스트다.

```go
// A broad round trip guards against an arithmetic slip in the permutation or
// its inverse, and confirms slugs are always 4 chars and never collide.
func TestDeckSlugBijective(t *testing.T) {
	seen := make(map[string]int64)
	for seq := int64(1); seq < 20000; seq++ {
		slug := encodeDeckSlug(seq)
		if len(slug) != slugLen {
			t.Fatalf("encodeDeckSlug(%d) = %q, want %d chars", seq, slug, slugLen)
		}
		if prev, dup := seen[slug]; dup {
			t.Fatalf("slug %q collides: seq %d and %d", slug, prev, seq)
		}
		seen[slug] = seq
		if got, err := decodeDeckSlug(slug); err != nil || got != seq {
			t.Fatalf("round trip %d -> %q -> %d (err %v)", seq, slug, got, err)
		}
	}
}
```

1번부터 2만 번 직전까지 모든 번호를 순회하며 세 가지를 확인한다.
슬러그가 항상 네 글자인지, 앞서 나온 슬러그와 겹치지 않는지, 다시 풀면 원래 번호로 돌아오는지다.
충돌 검사에는 `seen` 맵이 쓰였는데, 3장에서 본 comma-ok 관용구(`prev, dup := seen[slug]`)로 "이 슬러그가 전에 나왔는지"를 확인하고, 나왔다면 어느 번호와 부딪혔는지까지 메시지에 담는다.
2만 번의 반복이 부담스러워 보일 수 있지만, DB도 네트워크도 건드리지 않는 순수 계산이라 전수 검사조차 몇 밀리초면 끝난다.

정상 입력의 반대편, 거부해야 할 입력도 테이블로 고정한다.

```go
func TestDecodeDeckSlugInvalid(t *testing.T) {
	// Wrong length, non-Base36 byte, multibyte input, and the zero slug (which
	// maps back to seq 0) must all be rejected.
	for _, s := range []string{"", "abc", "abcde", "abc!", "한글", "0000"} {
		if _, err := decodeDeckSlug(s); err == nil {
			t.Errorf("decodeDeckSlug(%q) expected error", s)
		}
	}
}
```

빈 문자열, 세 글자와 다섯 글자(잘못된 길이), 허용되지 않는 문자, 한글 같은 멀티바이트 입력, 그리고 존재하지 않는 0번 덱으로 되돌아가는 `"0000"`까지, 여섯 가지 경계 입력이 한 줄짜리 테이블에 나란히 놓였다.
URL의 슬러그는 사용자가 아무 문자열이나 넣을 수 있는 입구라, 이런 경계값이 버그가 가장 잘 숨는 곳이다.
경계 사례를 발견할 때마다 테이블에 한 줄로 고정해 두면 같은 실수가 다시는 조용히 재발하지 못한다.
각 입력의 검증이 서로 독립이므로, 여기서는 `t.Errorf`로 끝까지 진행하며 실패를 한 번에 모두 보고한다.

## 테스트는 AI 에이전트의 검증 신호

이 테스트들은 사람을 위한 안전망인 동시에 AI 에이전트를 위한 명세다.
기대 동작이 테스트로 고정되어 있을수록 에이전트에게 맡길 수 있는 작업의 범위가 넓어지므로, 이 프로젝트는 순수 로직(srs, smartrules, 슬러그 인코딩)에 테스트를 집중 배치했다.
테스트가 AI 협업에서 갖는 의미는 12장에서 본격적으로 다루고, 테스트 실행을 강제하는 자동화는 13장에서 다룬다.

## 품질 검사 도구

테스트가 "동작이 맞는가"를 확인한다면, 그 앞 단계인 "코드가 형식과 상식에 맞는가"는 도구가 기계적으로 검사한다.
Go 툴체인에는 이런 품질 검사 도구가 함께 들어 있다.

::: info [용어 풀이] 포매터와 정적 분석(gofmt·go vet)
포매터는 줄 간격·들여쓰기 같은 코드의 겉모양을 정해진 하나의 형태로 자동 정리해 주는 도구이고(gofmt), 정적 분석은 코드를 실행하지 않고 읽기만 해서 버그가 될 만한 대목을 찾아 주는 도구다(go vet).
글을 소리 내어 낭독하지 않고도 맞춤법·문법 오류를 짚어 주는 검사기와 같다.
사람의 판단 없이 늘 같은 결과를 내므로, 사람이든 AI든 코드를 고칠 때마다 자동으로 돌리기에 알맞다.
:::

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
이 프로젝트에서는 AI 에이전트가 Go 파일을 수정할 때마다 훅(Hook)으로 gofmt와 go vet이 자동 실행되도록 구성했는데, 그 구조와 설계 의도는 13장에서 자세히 다룬다.

## 정리

첫째, `go test`는 세 가지 규칙(`_test.go` 파일, `Test` 접두사, `*testing.T` 매개변수)만 지키면 별도 프레임워크 없이 테스트를 찾아 실행한다.
테스트 파일을 검증 대상과 같은 패키지에 두면 비공개 함수까지 직접 검증할 수 있다.

둘째, 테이블 주도 테스트는 케이스 추가를 테이블 한 줄 추가로 만드는 Go의 표준 테스트 패턴이다.
시각을 인자로 받는 순수 함수 설계 덕분에 테스트가 결정적이 되고, 진행형 검증에는 `t.Fatalf`, 독립 검증에는 `t.Errorf`를 가려 쓴다.

셋째, 덱 슬러그 테스트에서 두 가지 습관을 봤다.
순수 계산은 2만 건 전수 검사조차 값싸게 돌릴 수 있고, 거부해야 할 경계 입력은 테이블 한 줄로 고정해 재발을 막는다.

넷째, gofmt·go vet·go build·staticcheck는 빠르고 결정적인 품질 검사 도구다.
테스트와 함께, 사람의 안전망이자 AI 에이전트가 자기 수정을 스스로 검증하는 신호로 작동한다.

다음 장에서는 이 Go 코드 위에서 HTTP API를 조립하는 웹 프레임워크 Gin을 다룬다.
로컬 서버와 Vercel 함수가 같은 Gin 엔진을 공유하는 구조가 어떻게 만들어지는지 확인해 보자.
