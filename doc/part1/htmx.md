# 12장 htmx: 자바스크립트 없이 만드는 동적 화면

10장에서 화면의 구조와 모양을 만드는 HTML·CSS를, 11장에서 서버가 데이터를 채워 HTML을 완성해 내려보내는 html/template을 살펴봤다.
여기까지의 화면은 "요청 한 번에 페이지 한 장" 모델이다.
링크를 누르거나 폼을 제출하면 브라우저가 서버에서 새 페이지를 통째로 받아 화면 전체를 다시 그린다.

덱 목록에서 덱 상세로 들어가는 흐름에는 이 모델로 충분하다.
그러나 Echo Flip의 학습 화면을 떠올려 보자.
카드를 뒤집고, 맞았는지 틀렸는지 버튼을 누르면, 곧바로 다음 카드가 나타나는 리듬이 이 앱의 핵심 경험이다.
채점 버튼을 누를 때마다 페이지 전체가 새로 로딩되면 화면이 깜빡이고 스크롤이 처음으로 돌아가서 이 리듬이 끊긴다.

이번 장에서는 이 문제를 htmx로 푸는 방법을 다룬다.
먼저 새로고침 없는 화면을 얻는 두 가지 길(자바스크립트 프레임워크와 htmx)을 트레이드오프로 비교하고, 카드 삭제 버튼이라는 가장 작은 예제로 htmx의 기본 동작을 익힌다.
이어서 서버가 페이지 대신 HTML 조각을 응답하는 구조(renderPartial), 서버에 아무것도 저장하지 않고 학습을 이어 가는 무상태 학습 화면, 응답 하나로 여러 자리를 갈아 끼우는 hx-swap-oob, 삭제 후 목록으로 이동시키는 HX-Redirect를 실제 코드로 짚어 보겠다.
마지막으로 htmx를 쓰더라도 끝내 남는 최소한의 자바스크립트(app.js)를 덩어리별로 해부한다.

## 새로고침 없는 화면을 얻는 두 가지 길

브라우저는 원래 페이지 단위로 움직인다.
그러나 자바스크립트를 쓰면 페이지를 떠나지 않고도 화면 뒤에서 요청을 보내고, 응답이 도착하면 화면의 일부만 바꿀 수 있다.
새로고침 없는 동적 화면은 어떤 방법을 쓰든 결국 이 기법 위에 서 있다.

::: info [용어 풀이] AJAX(비동기 요청)
페이지 전체를 새로 받지 않고, 자바스크립트가 화면 뒤에서 서버와 데이터를 주고받는 기법이다.
Asynchronous JavaScript and XML의 약자인데, 이름과 달리 요즘은 XML 대신 JSON이나 HTML 조각을 주고받는 경우가 대부분이다.
"비동기(asynchronous)"는 요청을 보내 놓고 응답을 기다리는 동안에도 화면이 멈추지 않고 계속 반응한다는 뜻이다.
:::

이 기법 위에서 동적 화면을 만드는 길은 크게 두 갈래로 나뉜다.

첫째, 화면 전체를 브라우저에서 그리는 자바스크립트 프레임워크다.
React, Vue, Svelte가 이 계열이고, 이렇게 만든 앱을 단일 페이지 애플리케이션(SPA, Single Page Application)이라고 부른다.
서버는 JSON 데이터만 내려 주고, 그 데이터를 HTML로 바꾸어 화면을 그리는 일은 전부 브라우저의 자바스크립트가 맡는다.
문서 편집기, 지도, 스프레드시트처럼 키 입력과 드래그 하나하나에 화면이 반응해야 하고 화면 상태가 복잡하게 얽히는 앱이라면 이쪽이 낫다.
대가도 뚜렷하다.
서버의 Go에 더해 브라우저 쪽에 또 하나의 애플리케이션을 만들어야 하므로 언어와 빌드 도구가 한 벌 더 필요하고, 서버가 가진 데이터와 브라우저가 가진 화면 상태를 동기화하는 코드가 앱의 큰 부분을 차지하게 된다.

둘째, 서버가 계속 HTML을 그리되, 브라우저는 받은 HTML 조각을 제자리에 갈아 끼우기만 하는 방식이다.
htmx가 이 계열의 대표다.
htmx는 "이 버튼이 눌리면 이 주소로 요청을 보내고, 응답으로 온 HTML을 저 요소 자리에 끼워 넣어라"라는 지시를 HTML 속성만으로 선언하게 해 주는 자바스크립트 라이브러리다.
우리가 자바스크립트를 쓰는 것이 아니라, htmx라는 완성품이 대신 써 주고 우리는 속성으로 주문만 한다.
11장에서 만든 서버 렌더링 구조가 그대로 연장되므로, 화면을 그리는 로직은 여전히 Go 한 곳에만 있다.

Echo Flip의 화면은 두 번째 길로 충분하다.
카드 채점, 카드 삭제, 사전 조회 같은 상호작용은 모두 "요청 한 번에 화면 조각 하나"로 표현되고, 키 입력 단위로 반응해야 하는 화면은 없다.
반대로 그런 화면이 앱의 중심이 되는 순간부터는 SPA가 더 나은 선택이 된다.

htmx를 켜는 방법은 한 줄이다.
다음은 모든 페이지의 공통 뼈대인 internal/web/templates/layout.html의 head 부분으로, 스타일시트와 함께 htmx와 app.js를 불러온다.

```html
  <link rel="stylesheet" href="/static/app.css">
  <script src="/static/htmx.min.js" defer></script>
  <script src="/static/app.js" defer></script>
```

htmx.min.js는 50KB 남짓한 파일 하나로, 외부에서 받아 오는 대신 저장소에 그대로 담아(vendoring) 11장에서 본 embed로 Go 바이너리에 함께 넣었다.
빌드 도구도, 패키지 설치도 없다.
이 파일이 하는 일은 문서에서 `hx-`로 시작하는 속성이 붙은 요소를 찾고, 거기 선언된 대로 요청을 보내고 응답을 DOM에 끼워 넣는 것이다.

::: info [용어 풀이] DOM(문서 객체 모델)
브라우저가 HTML 문서를 읽어 메모리에 만들어 두는 나무(tree) 구조다(Document Object Model).
화면에 보이는 모든 요소는 이 나무의 가지 하나이고, 자바스크립트가 가지를 바꾸면 화면이 즉시 따라 바뀐다.
"페이지 일부를 갈아 끼운다"라는 말은 정확히는 이 나무의 가지 하나를 새 가지로 바꾼다는 뜻이다.
:::

## 첫 htmx: 카드 삭제 버튼

가장 작은 예제부터 보자.
덱 상세 화면의 카드 목록에서 카드 한 장을 삭제하는 버튼으로, 페이지를 새로 고치지 않고 목록에서 그 줄만 사라지게 하고 싶다.

다음은 internal/web/templates/pages/deck.html의 카드 목록으로, 삭제 버튼에 htmx 속성 네 개가 붙어 있다.

```html
  {{range .Data.Cards}}
  <li class="tile row">
    <!-- ... 카드 원문과 뜻 ... -->
    <a class="btn btn-icon" href="/cards/{{.ID}}" aria-label="카드 수정">{{icon "pencil"}}</a>
    <button class="btn btn-icon" aria-label="카드 삭제"
      hx-post="/cards/{{.ID}}/delete" hx-target="closest li" hx-swap="outerHTML"
      hx-confirm="이 카드를 삭제할까요?">{{icon "trash"}}</button>
  </li>
  {{else}}
  <!-- ... 카드가 없을 때의 안내 ... -->
  {{end}}
```

속성 하나하나가 문장처럼 읽힌다.

- `hx-post`: 이 버튼이 눌리면 이 주소로 POST 요청을 보낸다.
- `hx-confirm`: 보내기 전에 이 문구로 확인 대화 상자를 띄운다.
- `hx-target="closest li"`: 응답을 끼워 넣을 자리는 이 버튼에서 가장 가까운 조상 `<li>`다.
- `hx-swap="outerHTML"`: 그 자리의 내용만 바꾸는 것(기본값 innerHTML)이 아니라, 타깃 요소 자체를 응답으로 통째로 바꾼다.

서버가 빈 응답을 주면 `<li>` 전체가 빈 것으로 교체되므로, 결과적으로 그 줄이 목록에서 사라진다.

서버 쪽 핸들러를 보자.
다음은 internal/web/pages.go의 deleteCard로, 같은 주소가 htmx 요청과 일반 폼 제출을 모두 처리한다.

```go
func (w *Web) deleteCard(c *gin.Context) {
	// ... 카드 ID를 읽어 삭제하고, 실패하면 에러 화면을 낸다 ...
	// htmx가 목록의 해당 <li>를 지우도록 빈 본문을 돌려준다.
	if c.GetHeader("HX-Request") != "" {
		c.Status(http.StatusOK)
		return
	}
	setFlash(c, "info", "카드를 삭제했어요")
	redirectBack(c, "/decks")
}
```

핵심은 `HX-Request` 헤더 분기다.
htmx는 자기가 보내는 모든 요청에 `HX-Request: true` 헤더를 붙인다.
서버는 이 헤더를 보고 "화면 조각을 원하는 요청"과 "페이지 전체를 원하는 요청"을 구분한다.
htmx 요청이면 빈 200 응답으로 `<li>`를 지우게 하고, 그렇지 않으면 알림 메시지(플래시)를 남기고 이전 화면으로 돌려보낸다.
하나의 주소, 하나의 핸들러가 두 세계를 모두 감당한다.

## 페이지와 조각이 같은 템플릿을 공유한다

htmx 요청의 응답은 완성된 페이지가 아니라 HTML 조각(fragment)이다.
11장에서 본 render는 layout 템플릿부터 실행해 `<html>`로 시작하는 페이지 전체를 만들었다.
조각을 응답하는 짝꿍이 renderPartial이다.

다음은 internal/web/web.go의 renderPartial로, 조각 전용 템플릿 묶음(Web 타입의 partials 필드)에서 이름 붙은 템플릿 하나만 실행해 그대로 써 보낸다.

```go
// renderPartial writes a single fragment — the response to an htmx request.
func (w *Web) renderPartial(c *gin.Context, name string, data any) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	if err := w.partials.ExecuteTemplate(c.Writer, name, data); err != nil {
		_ = c.Error(err)
	}
}
```

partials가 templates/partials/ 아래 파일들로 만들어지던 것은 11장의 템플릿 파싱 코드에서 봤다.

여기서 중요한 설계가 하나 있다.
페이지가 처음 로딩될 때의 화면과, htmx가 갈아 끼울 조각이 같은 템플릿 정의를 공유한다는 것이다.
다음은 internal/web/templates/pages/study.html로, 학습 페이지의 내용이 study_body라는 조각 템플릿을 불러 그리는 것이 전부다.

```html
{{define "content"}}
<!-- ... 스마트 덱 저장 버튼 ... -->
<div id="study-body">
  {{template "study_body" .Data.Body}}
</div>
{{end}}
```

학습을 시작하는 GET /study 요청은 render로 이 페이지 전체를 받는다.
그 뒤의 채점 요청은 renderPartial로 study_body 조각만 받아 `<div id="study-body">` 안을 갈아 끼운다.
첫 화면과 이후 화면이 같은 템플릿에서 나오므로, 같은 화면을 두 벌 만들어 어긋나게 관리할 일이 없다.

## 무상태 학습 화면

이제 이 장의 중심 문제로 들어가자.
학습은 요청 한 번으로 끝나지 않는 흐름이다.
카드가 줄지어 나오고, 틀린 카드는 라운드가 끝난 뒤 다시 나오고, 전부 맞히면 정답률과 함께 완료 화면이 나온다.
채점 요청이 도착했을 때 서버가 "다음 카드"를 내놓으려면 남은 카드, 현재 라운드, 점수 같은 진행 상태를 알아야 한다.

이 상태를 어디에 둘 것인가.

첫째, 서버 메모리에 둘 수 있다.
전통적인 서버라면 사용자별 세션 저장 공간에 진행 상태를 담아 두는 것이 자연스럽다.
그러나 이 앱의 운영 환경인 Vercel 서버리스 함수(16장)는 요청이 뜸하면 잠들었다가 새로 깨어나고(콜드스타트), 그때 메모리는 백지가 된다.
요청이 많아져 인스턴스가 여러 개로 늘어나면, 다음 채점 요청이 아까 그 인스턴스에 도착한다는 보장도 없다.

둘째, 데이터베이스에 둘 수 있다.
상태는 살아남지만 채점 한 번마다 상태를 읽고 쓰는 왕복이 추가되고, 중간에 떠나 버린 학습의 상태를 청소하는 일도 생긴다.
학습을 이어 하기(중단 후 재개)가 꼭 필요한 앱이라면 이 비용을 치를 가치가 있다.

셋째, 브라우저의 자바스크립트 변수에 둘 수 있다.
SPA가 택하는 방식인데, 그러려면 학습 흐름 전체가 브라우저 쪽 애플리케이션으로 옮겨 가야 한다.

Echo Flip의 선택은 넷째 길이다.
상태를 HTML 폼의 hidden 필드에 실어, 요청과 응답 사이를 계속 왕복시킨다.
서버는 채점 요청에 담겨 온 상태를 읽어 다음 상태를 계산하고, 다음 카드 조각에 새 상태를 hidden 필드로 다시 실어 보낸다.
HTTP가 본래 요청 하나하나가 독립인 무상태 프로토콜이라는 성질을 거스르지 않고 그대로 올라탄다(무상태라는 개념은 17장에서 정리한다).

다음은 internal/web/study.go의 상태 구조체로, 주석이 이 설계를 요약한다.

```go
// 학습 세션의 진행 상태는 서버에 저장하지 않는다. 카드 ID 큐·라운드·점수를
// hidden 필드로 폼에 실어 보내고, 채점(POST)마다 서버가 다음 상태를 계산해
// 다음 카드 조각(fragment)을 돌려준다. 서버리스(무상태)와 잘 맞는 구조다.
type studyState struct {
	SessionID string
	Direction string // text_to_meaning | meaning_to_text
	Title     string
	ReturnURL string
	Queue     []string // 이번 라운드에 남은 카드 ID (첫 번째가 현재 카드)
	Missed    []string // 이번 라운드에서 틀린 카드 ID
	Round     int
	RoundLen  int // 이번 라운드 전체 카드 수 (진행률 표시용)
	FPTotal   int // 1라운드 카드 수
	FPCorrect int // 1라운드 정답 수
	TtsRate   float64
}
```

이 구조체가 HTML로 변신한 모습이 internal/web/templates/partials/study.html의 study_state_fields다.
필드 하나가 hidden input 하나에 대응한다.

```html
{{/* 학습 진행 상태를 hidden 필드로 실어 나른다. 서버는 아무것도 기억하지
     않고, 채점 요청에 담긴 이 상태로 다음 화면을 계산한다. */}}
{{define "study_state_fields"}}
<input type="hidden" name="session" value="{{.State.SessionID}}">
<input type="hidden" name="direction" value="{{.State.Direction}}">
<!-- ... title·return_url ... -->
<input type="hidden" name="queue" value="{{.QueueJoined}}">
<input type="hidden" name="missed" value="{{.MissedJoined}}">
<input type="hidden" name="round" value="{{.State.Round}}">
<!-- ... round_len·fp_total·fp_correct·tts_rate ... -->
{{end}}
```

채점 버튼은 이 필드들을 품은 폼 안에 있다.
다음은 같은 파일의 채점 폼으로, 카드 뒷면 아래에 붙는 두 개의 버튼이다.

```html
      <form class="grade-grid" hx-post="/study/grade" hx-target="#study-body">
        {{template "study_state_fields" $}}
        <button class="btn btn-red btn-big" name="correct" value="false">{{icon "x"}} 틀렸어요</button>
        <button class="btn btn-green btn-big" name="correct" value="true">{{icon "check"}} 맞았어요</button>
      </form>
```

버튼 두 개에 각각 `name="correct"`와 다른 value가 붙어 있는 것에 주목하자.
HTML 폼의 기본 동작으로, 실제로 눌린 제출 버튼의 name과 value만 폼 값에 포함된다.
정답과 오답을 구분하는 데에도 자바스크립트가 필요 없다.

이제 서버가 이 폼을 받는 쪽이다.
다음은 internal/web/study.go의 gradeCard로, 채점 한 번에 벌어지는 모든 일이다.

```go
// gradeCard: 채점 한 번 = 리뷰 기록 + 다음 상태 계산 + 다음 화면 조각 응답.
func (w *Web) gradeCard(c *gin.Context) {
	state := stateFromForm(c)
	correct := c.PostForm("correct") == "true"
	// ... 큐가 비어 있으면 현재 국면만 다시 그리고 끝낸다 ...

	current := state.Queue[0]
	state.Queue = state.Queue[1:]

	sessionID, err1 := uuid.Parse(state.SessionID)
	cardID, err2 := uuid.Parse(current)
	if err1 == nil && err2 == nil {
		// 채점 기록 실패는 학습 흐름을 끊을 만큼 치명적이지 않다: 이번
		// 판정 하나가 통계에서 빠질 뿐이므로 세션은 계속 진행한다.
		// ... w.store.RecordReview(...) ...
	}

	if correct {
		if state.Round == 1 {
			state.FPCorrect++
		}
	} else {
		state.Missed = append(state.Missed, current)
	}

	// 마지막 카드까지 전부 맞혔으면 세션 완료를 기록한다.
	if len(state.Queue) == 0 && len(state.Missed) == 0 && err1 == nil {
		_ = w.store.FinishSession(c.Request.Context(), auth.UserID(c), sessionID, true)
	}

	w.renderPartial(c, "study_body", w.bodyView(c, state))
}
```

흐름을 따라가 보자.
stateFromForm이 폼 값에서 studyState를 다시 조립하고, 큐의 첫 카드를 꺼내 채점 결과를 데이터베이스에 기록한다(이것이 서버에 남는 유일한 것으로, 5장에서 설계한 리뷰 기록이다).
맞았으면 1라운드 점수를 올리고, 틀렸으면 Missed에 쌓는다.
마지막의 bodyView는 새 상태를 보고 다음 국면(큐에 카드가 남았으면 다음 카드, 큐는 비었는데 Missed가 있으면 "다시 풀기" 안내, 둘 다 비었으면 완료 화면)을 조각으로 그린다.
응답 조각에는 study_state_fields가 다시 들어 있으므로, 다음 채점 요청이 새 상태를 그대로 들고 돌아온다.

서버는 요청과 요청 사이에 아무것도 기억하지 않는다.
콜드스타트로 함수가 새로 깨어나도, 다음 요청이 어느 인스턴스에 떨어져도, 필요한 상태는 항상 요청 안에 들어 있다.

물론 공짜는 아니다.
이 설계의 대가를 정직하게 짚어 보자.

첫째, 상태가 HTML에 노출된다.
브라우저의 개발자 도구를 열면 hidden 필드를 볼 수 있고 고칠 수도 있다.
이 방식이 성립하는 이유는 여기 담긴 것이 카드 ID와 진행 숫자뿐이기 때문이다.
서버도 폼 값을 그대로 믿지 않아서, stateFromForm이 범위를 벗어난 값을 보정하고 돌아갈 주소(return_url)는 safeNext 함수가 검사해 다른 사이트로 이동시키지 못하게 한다.
채점 기록은 로그인한 사용자 자신의 카드에만 미치므로, 값을 조작해 봐야 자기 통계를 망칠 뿐이다.
민감하거나 신뢰가 필요한 상태(결제 금액, 권한 같은 것)라면 이 방식을 쓰면 안 된다.

둘째, 새로고침에 약하다.
페이지를 새로 고치면 폼과 함께 진행 상태가 사라지고, 학습은 새 세션으로 처음부터 시작된다.
서버나 데이터베이스에 상태를 두었다면 이어서 할 수 있었을 것이다.
한 번의 학습이 몇 분이면 끝나는 이 앱에서는 받아들일 만한 손실이지만, 긴 흐름을 다루는 앱이라면 둘째 대안(데이터베이스)이 낫다.

셋째, 요청마다 상태 전체가 왕복한다.
카드 ID 목록이 수백 개라면 요청 하나가 몇 KB씩 커진다.
이 앱의 학습 단위(기본 50장)에서는 무시할 수준이다.

얻는 것은 분명하다.
세션 저장소도, 상태 테이블도, 청소 작업도 없다.
서버리스의 제약(메모리가 사라진다)이 애초에 문제가 되지 않는 구조이고, 코드는 "폼을 읽고, 계산하고, 조각을 그린다"라는 순수한 왕복 하나로 단순해진다.

## hx-swap-oob: 응답 하나로 여러 자리 채우기

카드를 만들 때 편리한 기능이 하나 있다.
원문 칸에 영어 단어를 넣고 "사전에서 채우기" 버튼을 누르면, 뜻·발음 기호·예문 칸이 사전 조회 결과로 채워진다.

다음은 internal/web/templates/pages/card_form.html의 원문 입력 칸으로, 조회 버튼과 상태 메시지 자리가 함께 있다.

```html
    <span class="row-between">원문 (영어 · 용어)
      <span class="row">
        <!-- ... 발음 듣기 버튼 ... -->
        <button type="button" class="btn pill pill-blue"
          hx-post="/cards/lookup" hx-include="closest form"
          hx-target="#lookup-status" hx-swap="innerHTML">{{icon "book"}} 사전에서 채우기</button>
        <span id="lookup-status" class="tiny muted"></span>
      </span>
    </span>
```

새 속성이 하나 등장했다.
`hx-include="closest form"`은 버튼이 속한 폼 전체의 값을 요청에 실으라는 뜻이다.
덕분에 서버는 원문뿐 아니라 사용자가 이미 입력해 둔 뜻·발음·예문까지 받아 보고, 어느 칸이 비어 있는지 알 수 있다.

그런데 타깃을 보면 이상하다.
직접 갈아 끼울 자리(#lookup-status)는 상태 메시지 한 곳뿐인데, 채워야 할 입력 칸은 세 개다.
이럴 때 쓰는 것이 hx-swap-oob다.

서버 쪽부터 보자.
다음은 internal/web/dictionary.go의 핸들러 일부로, 무료 사전 API를 서버에서 조회해 폼 값과 합친다.

```go
func (w *Web) dictionaryLookup(c *gin.Context) {
	form := cardFormView{
		Text:     strings.TrimSpace(c.PostForm("text")),
		Meaning:  c.PostForm("meaning"),
		Phonetic: c.PostForm("phonetic"),
		Example:  c.PostForm("example"),
	}

	entry, err := lookupWord(form.Text)
	switch {
	// ... 조회 실패면 form.Status에 안내 문구만 담는다 ...
	default:
		form.Status = "사전에서 채웠어요"
		// 사용자가 이미 입력한 필드는 건드리지 않는다.
		if strings.TrimSpace(form.Phonetic) == "" {
			form.Phonetic = entry.Phonetic
		}
		// ... meaning과 example도 같은 방식 ...
	}
	w.renderPartial(c, "lookup_result", form)
}
```

응답 조각인 internal/web/templates/partials/lookup.html 전문이다.

```html
{{/* 사전 조회 응답: 상태 메시지(직접 타깃) + 비어 있던 폼 필드를
     hx-swap-oob로 바꿔치기한다. id는 card_form.html의 필드와 맞춘다. */}}
{{define "lookup_result"}}
<span>{{.Status}}</span>
<textarea id="f-meaning" name="meaning" rows="3" placeholder="우연한 행운, 뜻밖의 발견" hx-swap-oob="true">{{.Meaning}}</textarea>
<input id="f-phonetic" name="phonetic" placeholder="/ˌserənˈdipəti/" value="{{.Phonetic}}" hx-swap-oob="true">
<textarea id="f-example" name="example" rows="2" hx-swap-oob="true">{{.Example}}</textarea>
{{end}}
```

규칙은 이렇다.
응답의 최상위 요소 가운데 `hx-swap-oob="true"`가 붙은 요소는 타깃과 무관하게, 문서에서 같은 id를 가진 요소를 찾아 그 자리를 대신한다.
oob는 out of band, 즉 "지정된 통로 밖"이라는 뜻이다.
첫 번째 `<span>`만 원래 타깃(#lookup-status)에 들어가 상태 메시지가 되고, 나머지 세 요소는 각자 id가 같은 입력 칸(f-meaning, f-phonetic, f-example)을 찾아가 바꿔치기한다.
버튼 하나가 폼 전체를 보내고, 응답 하나가 화면의 네 곳에 나뉘어 들어간다.
사용자가 이미 뜻을 적어 두었다면 dictionaryLookup이 그 값을 받은 그대로 되돌려 주므로, 교체가 일어나도 입력이 지워지지 않는다.

사전 조회를 브라우저가 아니라 서버가 하는 것도 짚어 둘 만하다.
외부 API 호출과 응답 가공이 Go 코드에 있으므로 브라우저 자바스크립트가 필요 없고, 응답을 두 줄 요약으로 다듬는 로직(mapEntries)은 8장에서 본 방식대로 Go 테스트로 검증할 수 있다.

## HX-Redirect: 조각이 아니라 페이지 이동이 필요할 때

카드 삭제는 그 자리를 지우면 끝났다.
그런데 덱 상세 화면 상단의 덱 삭제 버튼(`hx-post="/decks/{{$deck.Slug}}/delete"`)은 사정이 다르다.
덱을 삭제하면 지금 보고 있는 화면이 통째로 무의미해지므로, 갈아 끼울 조각이 없고 덱 목록으로 이동해야 한다.

서버가 평소처럼 303 리다이렉트를 응답하면 곤란한 일이 생긴다.
htmx의 요청도 결국 브라우저를 통하므로 리다이렉트를 따라가서 덱 목록 페이지 HTML을 받아 오는데, htmx는 그것을 "응답 조각"으로 여겨 버튼 자리에 끼워 넣으려 한다.
페이지 속에 또 페이지가 들어간 화면이 된다.

그래서 htmx는 전용 응답 헤더를 정해 두었다.
`HX-Redirect` 헤더를 받으면 htmx가 조각 교체를 멈추고 브라우저 전체를 그 주소로 이동시킨다.
다음은 internal/web/pages.go의 deleteDeck으로, 요청의 출신에 따라 두 가지 이동 방식을 골라 쓴다.

```go
func (w *Web) deleteDeck(c *gin.Context) {
	// ... 덱 삭제와 에러 처리 ...
	setFlash(c, "info", "덱을 삭제했어요")
	// htmx 요청이면 HX-Redirect로, 일반 폼이면 303으로 이동한다.
	if c.GetHeader("HX-Request") != "" {
		c.Header("HX-Redirect", "/decks")
		c.Status(http.StatusOK)
		return
	}
	c.Redirect(http.StatusSeeOther, "/decks")
}
```

정리하면 htmx와 서버의 대화는 요청 헤더(HX-Request)와 응답 헤더(HX-Redirect)라는 얇은 약속 위에서 이루어진다.
서버 입장에서는 특별한 프로토콜이 아니라 그저 HTTP 헤더 두 개다.

## 그래도 남는 자바스크립트

여기까지 오면서 화면 갱신에 자바스크립트를 한 줄도 직접 쓰지 않았다.
카드 뒤집기조차 10장에서 본 대로 숨긴 체크박스와 CSS만으로 동작한다.
그렇다면 자바스크립트를 완전히 없앨 수 있을까.

없앨 수 없다.
서버는 사용자의 스피커를 울릴 수 없고, 클립보드에 쓸 수 없고, 지금 인터넷이 끊겼는지 알 수 없다.
이런 일은 브라우저가 자바스크립트에게만 열어 주는 통로로 해야 한다.

::: info [용어 풀이] Web API(브라우저)
브라우저가 페이지의 자바스크립트에 열어 주는 기능 묶음이다.
음성 합성(Web Speech), 클립보드, 온라인/오프라인 감지, 서비스 워커 등록처럼 사용자의 기기와 브라우저 자체를 다루는 창구다.
이 기능들은 사용자의 기기 안에서만 실행할 수 있으므로, 서버 렌더링 앱이라도 이 몫의 자바스크립트는 남는다.
:::

Echo Flip에서 우리가 직접 쓴 자바스크립트 파일은 internal/web/static/app.js 하나이고, 전부 81줄이다.
htmx.min.js는 남이 만든 완성품을 속성으로만 부리는 것이니 논외로 하면, 이 앱의 자바스크립트 전체를 한 절 안에서 훑을 수 있다.
파일 머리의 주석이 이 절의 논지를 요약한다.

```js
/* Echo Flip에 남은 유일한 자바스크립트.
   앱 로직은 전부 Go 서버에 있고, 이 파일은 브라우저에서만 접근할 수 있는
   API(음성 합성, 클립보드, 온라인 상태, 서비스 워커, 시간대)만 감싼다. */

// 시간대: 서버가 "오늘"의 경계와 통계 날짜를 사용자 기준으로 계산하도록 알린다.
document.cookie =
  "tz=" +
  encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") +
  ";path=/;max-age=31536000;samesite=lax";

// PWA: 서비스 워커 등록 (localhost 포함, http에서는 브라우저가 거부한다).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// 오프라인 배너.
const banner = document.getElementById("offline-banner");
if (banner) {
  const update = () => banner.classList.toggle("show", !navigator.onLine);
  addEventListener("online", update);
  addEventListener("offline", update);
  update();
}
```

첫 덩어리는 시간대 쿠키다.
"오늘 복습할 카드"의 오늘이 어느 시간대의 오늘인지는 브라우저만 안다.
브라우저가 자기 시간대 이름을 쿠키에 적어 두면 이후 모든 요청에 실려 가고, 서버의 clientTZ 함수가 그것을 읽어 날짜 경계를 계산한다(쿠키의 동작 원리는 17장에서 다룬다).
둘째 덩어리는 서비스 워커 등록으로, 앱을 홈 화면에 설치하고 오프라인에서도 열리게 만드는 준비 작업이다.
자세한 내용은 19장 PWA에서 다루므로 여기서는 한 줄 등록만 봐 두자.
셋째 덩어리는 네트워크가 끊기면 상단 배너를 보여 주는 코드로, online/offline 이벤트를 듣기만 한다.

다음 덩어리는 발음 듣기다.
카드의 스피커 버튼을 누르면 영어를 읽어 주는 기능으로, 음성 합성 Web API(Web Speech)를 감싼 speak 함수 하나다.

```js
function speak(text, rate) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel(); // Chrome은 취소하지 않으면 큐에 쌓인다
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate || 0.9;
  // ... 브라우저가 가진 목소리 중 영어 목소리 고르기 ...
  speechSynthesis.speak(u);
}
```

그런데 speak를 버튼에 어떻게 연결할 것인가.
여기에 이 파일에서 가장 중요한 패턴이 있다.
다음은 app.js의 클릭 처리 부분으로, 발음 듣기와 링크 복사가 모두 이 코드 하나를 거친다.

```js
// data-* 속성으로만 연결: 서버가 렌더링한(htmx로 갈아끼운) HTML에도 그대로 동작한다.
document.addEventListener("click", (e) => {
  const tts = e.target.closest("[data-tts], [data-tts-from]");
  if (tts) {
    e.preventDefault(); // 카드 뒤집기(label) 등 부모 동작을 막는다
    e.stopPropagation();
    const from = tts.dataset.ttsFrom && document.getElementById(tts.dataset.ttsFrom);
    speak(from ? from.value : tts.dataset.tts, parseFloat(tts.dataset.ttsRate));
    return;
  }

  const copy = e.target.closest("[data-copy]");
  if (copy) {
    e.preventDefault();
    navigator.clipboard
      .writeText(copy.dataset.copy)
      .then(() => (copy.dataset.done = "true"))
      .catch(() => prompt("아래 링크를 복사하세요", copy.dataset.copy));
  }
});
```

버튼마다 처리기를 붙이는 대신, 문서 전체에 클릭 처리기 하나를 붙여 두고 클릭된 요소에 `data-tts`나 `data-copy` 속성이 있는지 그때 확인한다.
이 패턴을 이벤트 위임이라고 부른다.

::: info [용어 풀이] 이벤트 위임(Event Delegation)
요소 하나하나에 클릭 처리기를 붙이는 대신, 문서 꼭대기에 처리기 하나를 붙여 두고 "방금 클릭된 것이 누구인지"를 그때그때 확인하는 패턴이다.
클릭 같은 이벤트가 자식에서 부모로 타고 올라오는 브라우저의 성질을 이용한다.
새 요소가 나중에 생겨나도 처리기를 다시 붙일 필요가 없다는 것이 핵심 장점이다.
:::

이 패턴이 htmx와 만나는 대목이 중요하다.
htmx는 화면 조각을 통째로 갈아 끼우므로, 채점할 때마다 스피커 버튼도 새 요소로 바뀐다.
버튼마다 처리기를 붙이는 방식이었다면 교체될 때마다 다시 붙여야 한다.
이벤트 위임에서는 처리기가 문서에 딱 하나 있고 요소는 속성만 지니면 되므로, 서버가 무엇을 언제 갈아 끼우든 그대로 동작한다.
서버 템플릿은 학습 화면의 `data-tts="{{$.TextTTS}}"`나 덱 화면의 공유 링크 복사 버튼처럼 데이터만 속성에 실어 두면 된다.
서버 렌더링과 브라우저 기능이 만나는 접점이 data-* 속성이라는 얇은 규약 하나로 좁혀진다.

파일의 나머지는 설정 화면 몫이다.
읽기 속도 슬라이더를 움직이면 현재 값을 옆에 보여 주고(`data-range-out`), "들어보기" 버튼이 그 속도로 예문을 읽는다(`data-tts-test`).
이것도 같은 이벤트 위임 패턴이라 옮겨 싣지 않는다.
여기까지가 이 앱의 자바스크립트 전부다.
음성, 클립보드, 네트워크 상태, 서비스 워커, 시간대.
전부 브라우저 밖에서는 할 수 없는 일이고, 앱의 로직(무엇을 보여 주고 어떻게 계산할지)은 한 줄도 없다.

## 에이전트 활용 아이디어

부분 갱신 층을 에이전트와 함께 다룰 때의 요령이다.

CLAUDE.md에는 이 앱의 htmx 사용 원칙을 적는다.
"화면 갱신은 자바스크립트 대신 hx- 속성으로 해결한다", "htmx 응답은 페이지 전체가 아니라 조각 템플릿을 렌더링한다", "브라우저 JS는 app.js 하나에만 추가한다"가 후보다.
지침이 없을 때 에이전트의 기본값은 fetch와 DOM 조작 코드이므로, 내버려 두면 app.js가 조용히 자라난다.

동적 화면을 시킬 때는 상호작용을 시나리오로 적는 것이 핵심이다.
"카드 삭제 버튼을 누르면 그 행만 사라지고, 실패하면 행이 남은 채 오류 표시가 뜬다"처럼 성공과 실패의 화면 변화까지 적으면, 에이전트가 hx-target과 hx-swap을 스스로 바르게 고른다.

검증은 통신 내용을 눈으로 보는 것이 가장 빠르다.
브라우저 개발자 도구의 네트워크 탭에서 응답이 조각 HTML인지 확인하는 절차를 지시문에 포함하거나, "이 상호작용이 보내는 요청과 응답 예시를 먼저 보여 달라"고 계획 단계에서 요구한다.

## 정리

이 장으로 10장에서 시작한 화면 이야기 세 편이 마무리됐다.
10장에서 문서(HTML)와 스타일(CSS)을, 11장에서 서버가 데이터를 채우는 html/template을, 이번 장에서 새로고침 없는 동적 화면을 만드는 htmx를 살펴봤다.

동적 화면의 두 갈래 중 Echo Flip은 서버가 계속 HTML을 그리는 길을 골랐다.
htmx는 `hx-post`(어디로 보낼지), `hx-target`(어디에 끼울지), `hx-swap`(어떻게 끼울지)이라는 속성 선언만으로 화면 조각 교체를 처리하고, 서버와는 HX-Request·HX-Redirect라는 HTTP 헤더로 대화한다.
서버는 renderPartial로 조각을 응답하되, 페이지와 조각이 study_body 같은 템플릿 정의를 공유해 화면이 한 벌로 유지된다.

이 장의 중심인 학습 화면은 진행 상태(카드 큐·라운드·점수)를 hidden 필드에 실어 왕복시키는 무상태 설계다.
콜드스타트로 메모리가 사라지는 서버리스 환경에서도 세션 저장소 없이 동작하는 대신, 상태가 화면에 노출되고 새로고침하면 처음부터 다시 시작한다는 대가를 치른다.
상태가 작고 민감하지 않으며 흐름이 짧을 때 성립하는 선택이고, 이어 하기가 중요하거나 상태를 신뢰해야 한다면 데이터베이스에 두는 편이 낫다.

그리고 자바스크립트는 0줄이 되지 않았다.
음성 합성, 클립보드, 오프라인 감지, 서비스 워커 등록, 시간대처럼 브라우저만 할 수 있는 일이 app.js 81줄로 남았고, 이벤트 위임과 data-* 속성 덕분에 이 코드는 htmx가 화면을 아무리 갈아 끼워도 손대지 않고 동작한다.
반대로 키 입력 하나하나에 화면이 반응해야 하는 앱이라면, 이 81줄로는 부족해지고 React 같은 자바스크립트 프레임워크가 제값을 한다.

여기까지로 데이터베이스, Go와 Gin, 화면까지 앱 한 벌이 어떻게 생겼는지 읽을 수 있게 됐다.
다음 13장에서는 지금까지 지면으로 읽어 온 이 앱을 독자의 컴퓨터에서 실제로 띄운다.
클론에서 실행까지 명령 하나로 끝나는 로컬 개발 환경이 그 내용이다.
