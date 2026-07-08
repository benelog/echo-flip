# 2장 Gin으로 만드는 HTTP API

1장에서는 Go 언어의 문법과 Echo Flip 백엔드의 패키지 구조를 살펴봤다.
이번 장에서는 그 위에서 HTTP API를 실제로 만드는 웹 프레임워크(web framework) Gin을 다룬다.
표준 라이브러리만으로 서버를 만들 때와 무엇이 달라지는지 비교하는 데서 출발해, Echo Flip이 라우팅·요청 바인딩·미들웨어·계층 분리를 어떻게 구성했는지 실제 코드로 짚어 보겠다.
로컬 개발 서버와 Vercel 서버리스 함수가 같은 Gin 엔진을 공유하는 조립 구조도 이 장의 중요한 주제다.

## 왜 Gin인가

### net/http만으로도 서버는 만들 수 있다

Go의 큰 매력 중 하나는 표준 라이브러리 `net/http`만으로도 실용적인 HTTP 서버를 만들 수 있다는 점이다.
특히 Go 1.22부터는 표준 라우터인 `http.ServeMux`가 크게 개선되어, HTTP 메서드 매칭과 경로 파라미터(path parameter)를 지원한다.

```go
mux := http.NewServeMux()
mux.HandleFunc("GET /api/decks/{slug}", func(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	// ...
})
```

라우팅만 놓고 보면 이 정도로 충분한 경우가 많다.
그렇다면 프레임워크는 무엇을 더해 주는가.
Echo Flip의 코드를 기준으로 보면 크게 세 가지다.

첫째, 라우트 그룹(route group)이다.
"이 경로 아래의 모든 API는 인증이 필요하다" 같은 규칙을 그룹 단위로 한 번만 선언할 수 있다.
표준 라이브러리에서는 핸들러마다 인증 검사를 감싸거나 래퍼 함수를 직접 만들어야 한다.

둘째, JSON 바인딩(binding)이다.
요청 본문의 JSON을 구조체로 역직렬화하고 실패를 일관되게 처리하는 `ShouldBindJSON` 같은 도우미가 있다.
표준 라이브러리로도 `json.NewDecoder(r.Body).Decode(&body)`를 쓰면 되지만, Content-Type 확인이나 검증 태그 연동 같은 잡무가 핸들러마다 반복된다.

셋째, 미들웨어 체인(middleware chain)이다.
패닉 복구, CORS, 인증처럼 모든 요청에 공통으로 적용할 처리를 등록 순서대로 실행하는 구조가 프레임워크에 내장되어 있다.
표준 라이브러리에서는 `http.Handler`를 겹겹이 감싸는 데코레이터 패턴을 손으로 조립해야 한다.

어느 것도 표준 라이브러리로 못 할 일은 아니지만, Echo Flip처럼 30개 가까운 엔드포인트에 인증·CORS·에러 응답 규약이 걸리는 API라면 이런 반복 코드를 프레임워크에 위임하는 편이 코드량과 실수 가능성을 함께 줄여 준다.

### 대안 비교: net/http, chi, Echo

Gin이 유일한 선택지는 아니다.
대안이 더 나은 경우를 함께 짚어 보자.

**net/http(1.22+ ServeMux)** 는 의존성이 전혀 없다는 것이 최대 장점이다.
엔드포인트가 몇 개 안 되고 미들웨어도 한두 개뿐인 소형 서비스, 혹은 외부 의존성을 최소화해야 하는 라이브러리성 도구라면 버전 업그레이드 부담도 학습 비용도 없는 표준 라이브러리만 쓰는 편이 낫다.

**chi**는 표준 `http.Handler` 인터페이스를 그대로 유지하는 얇은 라우터로, 표준 라이브러리 생태계의 미들웨어와 예제를 변환 없이 재사용할 수 있다.
"프레임워크에 종속되고 싶지 않다"는 요구가 강한 팀, 혹은 기존 net/http 코드에 라우팅만 보강하고 싶은 프로젝트라면 chi가 더 나은 선택이다.
대신 JSON 바인딩과 응답 도우미는 직접 갖춰야 한다.

**Echo**는 기능 범위가 Gin과 가장 비슷한 프레임워크다.
가장 큰 차이는 핸들러가 `func(c echo.Context) error`처럼 에러를 반환하고, 중앙의 에러 핸들러가 이를 HTTP 응답으로 변환한다는 점이다.
에러 처리를 한곳에 모으는 이 방식을 선호한다면 Echo가 더 맞을 수 있다.
Gin의 핸들러는 반환값이 없어서, 뒤에서 보겠지만 Echo Flip은 `fail` 같은 도우미 함수로 같은 효과를 낸다.

성능은 이 규모의 앱에서 의미 있는 변별 요소가 아니며, 네 후보 모두 개인용 암기 카드 앱의 트래픽을 감당하고도 남는다.
Echo Flip이 Gin을 고른 결정적 이유는 다른 데 있다.

### 사용자 층이 넓다는 것의 새로운 의미

Gin은 Go 웹 프레임워크 중 가장 널리 쓰이고, GitHub 스타 수도 압도적이다.
사용자 층이 넓다는 것은 전통적으로 문서·튜토리얼·Stack Overflow 답변이 많다는 뜻이었다.
그런데 AI 에이전트와 함께 개발하는 시대에는 여기에 한 겹의 의미가 더해진다.

Echo Flip의 백엔드 코드 대부분은 6장에서 다룰 Claude Code로 작성했다.
대규모 언어 모델(LLM, Large Language Model)은 학습 데이터에 많이 등장한 라이브러리일수록 정확한 코드를 생성한다.
Gin처럼 공개 코드와 질의응답이 풍부한 프레임워크는 에이전트가 API 시그니처를 잘못 기억하거나 존재하지 않는 메서드를 지어내는 일이 드물고, 소수만 쓰는 프레임워크를 고르면 생성된 코드를 사람이 일일이 교정하는 비용이 커진다.

"많이 쓰이는 기술을 고르면 검색이 잘 된다"는 오래된 조언이, "많이 쓰이는 기술을 고르면 AI가 잘 짠다"로 확장된 셈이다.

## 하나의 엔진, 두 개의 진입점

### pkg/app: Gin 엔진을 만드는 조립 지점

Echo Flip 백엔드의 심장은 `pkg/app/app.go`다.
이 패키지는 설정 로드, DB 커넥션 풀 생성, 핸들러 조립, 라우트 등록까지 마친 `*gin.Engine`을 만들어 반환한다.

다음은 pkg/app/app.go의 엔진 생성부다.

```go
var (
	engine     *gin.Engine
	engineOnce sync.Once
	engineErr  error
)

// Engine returns the process-wide router; warm serverless instances reuse it.
func Engine() (*gin.Engine, error) {
	engineOnce.Do(func() {
		engine, engineErr = build()
	})
	return engine, engineErr
}

func build() (*gin.Engine, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	pool, err := db.Pool(context.Background(), cfg.DatabaseURL)
	// ... 에러 처리 생략
	h := handlers.New(store.New(pool))

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	// ... 미들웨어와 라우트 등록 (뒤 절에서 발췌)
	return r, nil
}
```

몇 가지 눈여겨볼 지점이 있다.

첫째, `sync.Once`로 엔진을 프로세스당 한 번만 만든다.
Vercel 서버리스 함수는 웜 인스턴스(warm instance)가 살아 있는 동안 여러 요청을 같은 프로세스에서 처리하므로, 요청마다 DB 풀과 라우터를 다시 만들면 낭비가 크다.
싱글턴(singleton)으로 만들어 두면 콜드 스타트(cold start) 첫 요청에서만 조립 비용을 치른다.

둘째, `gin.Default()` 대신 `gin.New()`에 `gin.Recovery()`만 붙였다.
`gin.Default()`는 로거와 패닉 복구 미들웨어를 함께 등록하는데, Vercel 환경에서는 플랫폼이 요청 로그를 남겨 주므로 Gin의 요청 로거는 중복이다.
패닉이 나도 프로세스가 죽지 않도록 복구 미들웨어만 남겼다.

셋째, `build()` 안에서 실패할 수 있는 일(설정 누락, DB 연결 실패)은 모두 에러로 반환한다.
진입점 쪽에서 이 에러를 어떻게 다루는지가 다음 주제다.

### 로컬 서버와 Vercel 함수가 같은 앱을 공유한다

이 앱에는 진입점(entrypoint)이 두 개다.
로컬 개발용 상주 서버와 Vercel에 배포되는 서버리스 함수(serverless function)다.
둘 다 방금 본 `app.Engine()`을 호출해 같은 엔진을 얻는다.

다음은 로컬 서버인 cmd/server/main.go의 전부다.

```go
func main() {
	engine, err := app.Engine()
	if err != nil {
		log.Fatal(err)
	}
	port := os.Getenv("PORT")
	// ... 미지정 시 기본값 8080
	if err := engine.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
```

`engine.Run`은 내부적으로 `http.ListenAndServe`를 호출하는 얇은 포장이다.
로컬에서는 `go run ./cmd/server`로 8080 포트에 서버를 띄우고 프런트엔드와 함께 개발한다.

Vercel 쪽 진입점은 api/index.go다.

```go
// Package handler is the Vercel serverless entrypoint. vercel.json rewrites
// every /api/* request here; the original path is preserved.
// Vercel compiles this file outside the module, so it must not import
// internal/ packages (directly); shared code it needs lives in pkg/.
package handler

func Handler(w http.ResponseWriter, r *http.Request) {
	engine, err := app.Engine()
	if err != nil {
		http.Error(w, "server misconfigured: "+err.Error(), http.StatusInternalServerError)
		return
	}
	engine.ServeHTTP(w, r)
}
```

이 코드가 성립하는 이유는 `*gin.Engine`이 표준 `http.Handler` 인터페이스를 구현하기 때문이다.
Vercel이 요구하는 시그니처 `func(http.ResponseWriter, *http.Request)` 안에서 `engine.ServeHTTP`를 호출하면, Gin 라우터가 경로를 보고 알아서 핸들러를 찾아 실행한다.
`vercel.json`의 재작성(rewrite) 규칙이 모든 `/api/*` 요청을 이 함수 하나로 모아 주므로, 함수는 하나지만 API 전체가 동작한다.

왜 조립 코드를 `internal`이 아닌 `pkg/app`에 두었는지도 주석에 답이 있다.
Vercel의 Go 빌더는 `api/index.go`를 모듈 바깥에서 컴파일하기 때문에, 이 파일은 `internal/` 패키지를 직접 가져올 수 없다.
그래서 진입점이 필요로 하는 공유 코드는 Go의 `internal` 가시성 규칙이 적용되지 않는 `pkg/` 아래에 둔 것이다.
이런 Vercel 함수의 제약과 배포 구성은 8장에서 자세히 다룬다.

정리하면, 이 구조의 이점은 두 가지다.
첫째, 로컬과 프로덕션이 완전히 같은 라우팅·미들웨어·핸들러를 지나므로 "로컬에서는 됐는데 배포하니 다르다"류의 문제가 줄어든다.
둘째, 실행 환경이 바뀌어도(예: Vercel에서 일반 컨테이너로 이전) 진입점 파일 하나만 새로 쓰면 된다.

## 라우팅과 핸들러

### 라우트 그룹으로 인증 경계를 선언한다

pkg/app/app.go의 라우트 등록부를 발췌해 보자.

```go
r.GET("/api/healthz", h.Healthz)

pub := r.Group("/api", auth.OptionalMiddleware(cfg.JWKSURL, cfg.JWTSecret), func(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
})
{
	pub.GET("/shared-decks", h.ListSharedDecks)
	pub.GET("/shared-decks/:slug", h.GetSharedDeck)
}

api := r.Group("/api", auth.Middleware(cfg.JWKSURL, cfg.JWTSecret), h.EnsureProfile())
{
	api.GET("/decks", h.ListDecks)
	api.POST("/decks", h.CreateDeck)
	// Decks are addressed by their short slug, not the UUID.
	api.GET("/decks/:slug", h.GetDeck)
	api.PATCH("/decks/:slug", h.UpdateDeck)
	api.DELETE("/decks/:slug", h.DeleteDeck)
	api.GET("/decks/:slug/cards", h.ListDeckCards)
	// ...
	api.POST("/sessions", h.CreateSession)
	api.POST("/sessions/:id/reviews", h.RecordReview)
	// ...
}
```

라우팅이 세 구역으로 나뉜다.
헬스 체크는 미들웨어 없이 루트에 직접 등록한다.
공유 덱 열람은 비로그인 사용자도 허용해야 하므로, 토큰이 있으면 확인하되 없어도 거절하지 않는 `OptionalMiddleware`를 붙인 `pub` 그룹에 둔다.
나머지 전부는 유효한 토큰을 요구하는 `Middleware`가 붙은 `api` 그룹이다.

두 그룹이 같은 `/api` 접두사를 쓴다는 점이 흥미롭다.
Gin의 그룹은 "접두사 + 미들웨어 묶음"일 뿐이어서, 등록되는 최종 경로가 겹치지만 않으면 같은 접두사로 여러 그룹을 만들어 엔드포인트마다 다른 인증 정책을 부여할 수 있다.

`r.Group`의 두 번째 인자부터는 미들웨어를 가변 인자로 받는다.
`pub` 그룹의 세 번째 인자처럼 익명 함수를 즉석에서 미들웨어로 끼워 넣을 수도 있다.
여기서는 응답이 Authorization 헤더에 따라 달라지므로, 공유 캐시가 로그인 사용자의 응답을 익명 방문자에게 재사용하지 않도록 `Cache-Control: no-store`를 일괄로 붙였다.

중괄호 블록 `{ ... }`는 문법적 의미가 없는 관례로, 그룹에 속한 라우트를 시각적으로 묶어 주는 들여쓰기 용도다.

### gin.Context: 요청과 응답을 다루는 단일 창구

Gin 핸들러의 시그니처는 `func(c *gin.Context)` 하나다.
`gin.Context`는 요청 읽기(파라미터, 본문, 헤더)와 응답 쓰기(상태 코드, JSON), 미들웨어 간 데이터 전달까지 담당하는 단일 창구다.

가장 단순한 핸들러인 internal/handlers/handlers.go의 헬스 체크부터 보자.

```go
func (h *Handlers) Healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
```

`c.JSON`은 인자를 JSON으로 직렬화하고 Content-Type 헤더와 상태 코드를 설정한다.
`gin.H`는 `map[string]any`의 별칭으로, 일회성 응답 객체를 만들 때 구조체 선언을 생략하게 해 준다.

경로 파라미터는 `c.Param`으로 읽는다.
internal/handlers/decks.go의 덱 단건 조회다.

```go
func (h *Handlers) GetDeck(c *gin.Context) {
	deck, err := h.Store.GetDeckBySlug(c.Request.Context(), auth.UserID(c), c.Param("slug"))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, deck)
}
```

라우트의 `:slug` 자리에 매칭된 값을 `c.Param("slug")`로 꺼낸다.
`c.Request.Context()`로 표준 `context.Context`를 꺼내 스토어 계층에 넘기는 것도 눈여겨보자.
클라이언트가 요청을 중단하면 이 컨텍스트가 취소되어 진행 중인 DB 쿼리도 함께 중단된다.

쿼리 파라미터(query parameter)는 `c.Query`로 읽는다.
internal/handlers/sessions.go의 복습 대기 카드 수 조회 `DueCount`가 좋은 예다.

```go
dueBefore := time.Now()
if raw := c.Query("dueBefore"); raw != "" {
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		badRequest(c, "dueBefore must be RFC3339")
		return
	}
	dueBefore = t
}
// ... 스토어 조회 후 c.JSON으로 {"count": n} 응답
```

파라미터가 없으면 현재 시각을 기본값으로 쓰고, 있으면 RFC3339 형식으로 파싱하되 실패 시 400으로 응답한다.
"없으면 기본값, 있으면 검증"은 선택적 쿼리 파라미터를 다루는 전형적인 패턴이다.

JSON이 아닌 응답도 가능하다.
internal/handlers/cards.go의 CSV 내보내기 핸들러 `ExportDeck`은 `c.Header`로 Content-Type을 지정한 뒤, `gin.Context`가 감싸고 있는 응답 스트림 `c.Writer`에 표준 라이브러리의 `csv.Writer`를 그대로 연결해 쓴다.
프레임워크를 쓰더라도 표준 인터페이스로 내려가는 통로가 열려 있다는 점은 Gin의 장점이다.

## 요청 바인딩과 검증

### ShouldBindJSON과 익명 구조체

요청 본문을 받는 핸들러의 기본 패턴을 internal/handlers/decks.go의 덱 생성에서 보자.

```go
func (h *Handlers) CreateDeck(c *gin.Context) {
	var body struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		badRequest(c, "name is required")
		return
	}
	deck, err := h.Store.CreateDeck(c.Request.Context(), auth.UserID(c), strings.TrimSpace(body.Name), body.Description)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, deck)
}
```

요청 본문 전용 타입은 핸들러 안의 익명 구조체(anonymous struct)로 선언했다.
이 필드 조합을 다른 곳에서 쓸 일이 없으므로 패키지 수준 타입으로 승격하지 않은 것이다.

Gin에는 `BindJSON`과 `ShouldBindJSON` 두 계열이 있다.
`BindJSON`은 파싱 실패 시 스스로 400 응답을 쓰고 요청을 중단하는 반면, `ShouldBindJSON`은 에러만 반환하고 응답은 호출자에게 맡긴다.
Echo Flip은 에러 메시지 형식을 직접 통제하기 위해 일관되게 `ShouldBind` 계열을 쓴다.

Gin은 `binding:"required"` 같은 구조체 태그로 선언적 검증도 지원한다(내부적으로 go-playground/validator를 쓴다).
그런데 이 프로젝트는 태그 대신 `strings.TrimSpace(body.Name) == ""` 같은 코드로 직접 검증한다.
공백만 있는 이름 거부처럼 태그로 표현하기 애매한 규칙이 있고, 에러 메시지를 사람이 읽을 문장으로 직접 쓰고 싶었기 때문이다.
검증 규칙이 많고 정형적이라면 태그 방식이 코드를 줄여 주므로, 프로젝트 성격에 따라 선택하면 된다.

부분 수정(PATCH)에서는 포인터 필드가 활약한다.
같은 파일의 덱 수정을 보자.

```go
func (h *Handlers) UpdateDeck(c *gin.Context) {
	// ...
	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	// ... ShouldBindJSON 생략
	if body.Name != nil && strings.TrimSpace(*body.Name) == "" {
		badRequest(c, "name cannot be empty")
		return
	}
	// ...
}
```

필드를 `*string`으로 선언하면 "JSON에 키가 없었다(nil)"와 "빈 문자열이 왔다"를 구분할 수 있다.
`name`을 보내지 않으면 이름을 유지하고, 보냈는데 공백이면 거부하는 PATCH 의미론이 이 구분 위에서 성립한다.

### 바인딩 타입의 재사용과 변환 함수

카드는 생성·수정·일괄 등록 세 곳에서 같은 필드를 받는다.
그래서 internal/handlers/cards.go는 익명 구조체 대신 이름 있는 타입과 변환 함수를 뒀다.

```go
type cardBody struct {
	DeckSlug string   `json:"deckSlug"`
	Text     string   `json:"text"`
	Meaning  string   `json:"meaning"`
	CardType string   `json:"cardType"`
	Tags     []string `json:"tags"`
	// ...
}

func (b *cardBody) toInput() (store.CardInput, string) {
	b.Text = strings.TrimSpace(b.Text)
	b.Meaning = strings.TrimSpace(b.Meaning)
	if b.Text == "" || b.Meaning == "" {
		return store.CardInput{}, "text and meaning are required"
	}
	if b.CardType == "" {
		b.CardType = "word"
	}
	if !validCardType(b.CardType) {
		return store.CardInput{}, "cardType must be word, sentence, idiom or concept"
	}
	// ...
}
```

`toInput`은 HTTP 입력 타입 `cardBody`를 검증하면서 스토어 계층의 입력 타입 `store.CardInput`으로 변환한다.
두 번째 반환값은 검증 실패 사유이고, 빈 문자열이면 통과다.
정규화(공백 제거), 기본값 채우기(`cardType` 미지정 시 word), 허용값 검사가 이 한 함수에 모여 있어서, 카드를 받는 세 핸들러가 검증 규칙을 공유한다.

일괄 등록 핸들러 `BulkCreateCards`도 같은 함수를 행 단위로 재사용하지만 실패 정책이 다르다.
단건 생성은 검증 실패 시 즉시 400이지만, CSV에서 파싱한 최대 2,000행의 일괄 등록은 불량 행만 건너뛰고 나머지를 저장한 뒤 건너뛴 개수를 `invalid`로 응답에 담는다.
같은 검증 로직이라도 실패를 어떻게 다룰지는 엔드포인트의 성격에 따라 달라진다는 점을 보여 주는 예다.

### 에러 응답을 도우미 함수로 통일한다

핸들러마다 에러 응답 JSON을 손으로 만들면 형식이 조금씩 어긋나기 마련이다.
internal/handlers/handlers.go는 두 개의 도우미로 이를 통일한다.

```go
func fail(c *gin.Context, err error) {
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	log.Printf("internal error: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

func badRequest(c *gin.Context, msg string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": msg})
}
```

`badRequest`는 클라이언트 잘못(400)을, `fail`은 서버 측 처리 결과를 담당한다.
`fail`이 하는 일이 사실상 이 앱의 에러 처리 정책 전부다.
스토어 계층이 돌려준 에러가 `store.ErrNotFound`면 404로, 그 밖의 모든 에러는 로그에만 상세를 남기고 클라이언트에는 "internal error"라는 무정보 메시지로 500을 준다.
DB 에러 문자열을 그대로 노출하면 내부 구조가 새어 나가므로, 상세는 서버 로그에만 남기는 것이 안전하다.

앞서 언급했듯 Gin 핸들러는 에러를 반환하지 않는 시그니처라서, 이런 도우미 호출 뒤 `return`하는 패턴이 모든 핸들러에 반복된다.
Echo라면 `return err` 한 줄로 중앙 에러 핸들러에 위임했을 대목이다.
반복이 거슬릴 수 있지만, 어느 지점에서 어떤 상태 코드가 나가는지 핸들러 안에서 다 보인다는 가독성의 이점도 있다.
이 트레이드오프를 어떻게 평가하느냐가 Gin과 Echo 선택의 갈림길 중 하나다.

## 미들웨어

### 미들웨어는 등록 순서대로 실행되는 체인이다

미들웨어(middleware)는 핸들러 앞뒤에서 공통 처리를 수행하는 함수다.
Gin에서 미들웨어와 핸들러는 같은 타입 `gin.HandlerFunc`이고, 한 요청에 매칭된 함수들이 등록 순서대로 배열을 이뤄 실행된다.
미들웨어 안에서 `c.Next()`를 호출하면 체인의 다음 함수로 진행하고, `c.Abort()`를 호출하면 남은 체인을 건너뛴다.

Echo Flip에서 인증이 필요한 요청 하나가 지나는 체인을 나열하면 다음과 같다.

1. `gin.Recovery()` — 패닉을 잡아 500으로 변환한다(전역).
2. CORS 미들웨어 — 허용 출처 검사와 사전 요청(preflight) 응답(전역, 설정된 경우).
3. `auth.Middleware` — JWT 검증, 사용자 ID를 컨텍스트에 저장(그룹).
4. `h.EnsureProfile()` — 프로필 행 지연 생성(그룹).
5. 최종 핸들러.

전역 미들웨어는 `r.Use(...)`로, 그룹 미들웨어는 `r.Group(경로, 미들웨어...)`로 붙인다는 것을 앞 절에서 봤다.
순서가 곧 의미다.
Recovery가 가장 바깥에 있어야 안쪽 어디에서 패닉이 나도 잡을 수 있고, 인증이 EnsureProfile보다 앞이어야 "누구의 프로필인지"를 알 수 있다.

### CORS: 브라우저를 위한 출처 허용

프런트엔드와 API의 출처(origin)가 다르면 브라우저는 교차 출처 리소스 공유(CORS, Cross-Origin Resource Sharing) 검사를 수행한다.
pkg/app/app.go는 gin-contrib/cors 미들웨어로 이를 처리한다.

```go
if len(cfg.AllowedOrigins) > 0 {
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		MaxAge:           12 * time.Hour,
		AllowCredentials: false,
	}))
}
```

허용 출처는 하드코딩하지 않고 환경 변수 `ALLOWED_ORIGINS`에서 읽으므로(internal/config/config.go), 로컬 개발에서는 `http://localhost:3000`을 넣는 식으로 환경마다 값만 바꾼다.
프로덕션 배포에서는 프런트엔드 정적 파일과 API가 같은 Vercel 도메인에서 서비스되어 교차 출처 자체가 발생하지 않으므로, 이 미들웨어는 사실상 로컬 개발과 예외적 구성을 위한 장치다.
`AllowCredentials: false`인 이유는 인증에 쿠키가 아니라 Authorization 헤더를 쓰기 때문이다.

### JWT 인증 미들웨어: 컨텍스트에 사용자 ID를 싣는다

인증 미들웨어의 역할은 "토큰을 검증하고, 통과하면 사용자 ID를 요청 컨텍스트에 실어 준다"는 한 문장으로 요약된다.

internal/auth/jwt.go의 핵심부를 보자.

```go
const userIDKey = "auth.userID"

// Middleware validates the Supabase access token and stores the user id.
func Middleware(jwksURL, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := bearerToken(c)
		if raw == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		kf, err := keyfuncFor(jwksURL, secret)
		// ... 검증 키 준비 실패 시 500 응답 (생략)
		userID, err := parseUserID(raw, kf)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(userIDKey, userID)
		c.Next()
	}
}

func UserID(c *gin.Context) uuid.UUID {
	return c.MustGet(userIDKey).(uuid.UUID)
}
```

`Middleware`는 설정값을 받아 `gin.HandlerFunc`를 반환하는 팩토리 함수다.
미들웨어에 인자를 넘기고 싶을 때 쓰는 Gin의 표준 관용구다.

흐름을 따라가 보면, 먼저 Authorization 헤더에서 Bearer 토큰을 꺼내고, 없으면 `c.AbortWithStatusJSON`으로 401을 응답하며 체인을 끊는다.
토큰은 Supabase가 발급한 JWT(JSON Web Token)로, `parseUserID`가 서명·만료·수신자(audience)를 검증한 뒤 subject 클레임에서 사용자 UUID를 얻는다.
서명 검증 키는 JWKS(JSON Web Key Set) URL에서 가져오는데, 그 상세 원리와 Supabase 인증 체계는 9장에서 다룬다.
이 장에서 중요한 것은 마지막 두 줄이다.
검증에 성공하면 `c.Set(userIDKey, userID)`로 사용자 ID를 요청 컨텍스트에 저장하고 `c.Next()`로 진행한다.

이후의 모든 핸들러는 `auth.UserID(c)` 한 줄로 "지금 요청한 사용자"를 얻는다.
앞서 본 핸들러들에서 `h.Store.ListDecks(ctx, auth.UserID(c))`처럼 스토어 호출마다 사용자 ID가 첫 인자로 들어가던 것이 바로 이 값이다.
모든 쿼리가 사용자 ID로 스코프되므로, 남의 덱을 조회하려는 시도는 인가 검사 이전에 "존재하지 않는 행"이 된다.

`UserID`가 값이 없으면 패닉을 일으키는 `c.MustGet`을 쓴다는 점도 짚어 두자.
인증 미들웨어 뒤에서만 호출된다는 전제가 있으므로 값이 없다는 것은 라우팅 구성 버그이고, 조용히 빈 값으로 진행하는 것보다 크게 실패하는 편이 버그를 빨리 드러낸다.

공개 엔드포인트용 `OptionalMiddleware`는 같은 검증을 시도하되, 토큰이 유효하면 사용자 ID를 실어 주고 없거나 무효면 거절 없이 통과시킨다.
핸들러 쪽에서는 `auth.OptionalUserID(c)`로 "로그인했으면 UUID, 아니면 uuid.Nil"을 받아, 공유 덱 목록에 "내 덱" 표시를 붙이는 개인화에 쓴다.

### 도메인 로직도 미들웨어가 될 수 있다

미들웨어가 인증·로깅 같은 횡단 관심사 전용은 아니다.
internal/handlers/handlers.go의 `EnsureProfile`은 도메인 요구를 미들웨어로 푼 예다.

```go
func (h *Handlers) EnsureProfile() gin.HandlerFunc {
	var seen sync.Map
	return func(c *gin.Context) {
		userID := auth.UserID(c)
		if _, ok := seen.Load(userID); !ok {
			if _, err := h.Store.GetOrCreateProfile(c.Request.Context(), userID, ""); err != nil {
				fail(c, err)
				c.Abort()
				return
			}
			seen.Store(userID, struct{}{})
		}
		c.Next()
	}
}
```

덱과 카드 테이블은 profiles 테이블을 외래 키로 참조하므로, 첫 쓰기 전에 프로필 행이 존재해야 한다.
이를 각 핸들러에서 챙기는 대신, 인증 그룹 전체에 미들웨어로 걸어 "인증된 사용자는 반드시 프로필이 있다"는 불변식을 만든 것이다.
클로저에 가둔 `sync.Map`이 웜 인스턴스 안에서 사용자별로 한 번만 DB를 확인하게 하는 캐시 역할을 하는데, 팩토리 함수가 반환하는 클로저에 상태를 담는 미들웨어 관용구의 응용이다.

## 계층 분리: handlers와 store

### 두 계층의 골격

Echo Flip 백엔드는 HTTP 관심사와 데이터 접근을 두 패키지로 나눈다.
internal/handlers는 요청 파싱·검증·상태 코드를, internal/store는 SQL과 도메인 타입을 담당한다.

각 계층의 골격은 단순하다.
internal/handlers/handlers.go와 internal/store/store.go에서 발췌한다.

```go
// internal/handlers/handlers.go
type Handlers struct {
	Store *store.Store
}

func New(s *store.Store) *Handlers {
	return &Handlers{Store: s}
}
```

```go
// internal/store/store.go
var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}
```

`Handlers`는 `Store`를 품고, `Store`는 pgx 커넥션 풀을 품는다.
조립은 pkg/app/app.go의 `handlers.New(store.New(pool))` 한 줄이 전부다.
프레임워크 없이 생성자 함수로 엮는 수동 의존성 주입(dependency injection)인데, 이 규모에서는 이것으로 충분하다.

`ErrNotFound`는 센티널 에러(sentinel error)다.
스토어의 모든 조회 함수가 "행 없음"을 이 에러로 통일해 반환하고, 앞서 본 핸들러의 `fail`이 이를 404로 변환한다.
pgx의 `ErrNoRows` 같은 드라이버 세부가 핸들러까지 새어 나오지 않도록 경계에서 번역하는 셈이다.

### 경계에서 무엇이 오가는가

같은 기능을 두 계층이 어떻게 나눠 맡는지 덱 슬러그 해석으로 확인해 보자.
internal/store/decks.go의 스토어 쪽 코드다.

```go
func (s *Store) DeckIDBySlug(ctx context.Context, userID uuid.UUID, slug string) (uuid.UUID, error) {
	seq, err := decodeDeckSlug(slug)
	if err != nil {
		return uuid.Nil, ErrNotFound
	}
	var id uuid.UUID
	err = s.pool.QueryRow(ctx,
		`select id from decks where user_id = $1 and seq = $2`, userID, seq).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	return id, err
}
```

핸들러 쪽 대응부는 internal/handlers/handlers.go의 도우미다.

```go
func (h *Handlers) pathDeckID(c *gin.Context) (uuid.UUID, bool) {
	id, err := h.Store.DeckIDBySlug(c.Request.Context(), auth.UserID(c), c.Param("slug"))
	if err != nil {
		fail(c, err)
		return uuid.Nil, false
	}
	return id, true
}
```

역할 분담이 뚜렷하다.
스토어는 `context.Context`, `uuid.UUID`, `string` 같은 일반 타입만 받고 SQL을 실행하며, 실패를 도메인 에러로 번역한다.
핸들러는 `gin.Context`에서 값을 꺼내 스토어에 넘기고, 결과를 상태 코드와 JSON으로 번역한다.
스토어는 HTTP를 모르고, 핸들러는 SQL을 모른다.

이 분리의 이점을 세 가지로 정리할 수 있다.

첫째, 책임이 분리되어 변경 범위가 예측된다.
응답 형식을 바꾸는 일은 handlers만, 쿼리를 최적화하는 일은 store만 건드린다.
잘못된 슬러그와 남의 덱을 모두 404로 처리하는 정책처럼 두 계층에 걸치는 결정도, `ErrNotFound`라는 하나의 계약으로 표현된다.

둘째, 테스트가 쉬워진다.
스토어 함수는 `gin.Context`를 요구하지 않으므로 HTTP 없이 DB만 있으면 검증할 수 있고, 슬러그 인코딩 같은 순수 로직은 internal/store/deckslug_test.go처럼 DB조차 없이 단위 테스트하며, 핸들러가 얇아진 덕에 HTTP 계층의 테스트 부담 자체가 줄어든다.

셋째, AI 에이전트와의 협업 단위가 명확해진다.
"덱 목록 응답에 카드 수를 추가해 줘" 같은 요청이 어느 파일의 어느 계층을 고치는 일인지 구조에서 바로 드러나므로, 에이전트가 생성한 변경을 사람이 검토하는 범위도 좁아진다.

다만 이 앱의 분리는 실용주의적 절충이라는 점도 밝혀 둔다.
internal/store/decks.go의 `Deck` 구조체에는 `json:"id"` 같은 태그가 붙어 있어, 스토어의 도메인 타입이 API 응답 타입을 겸한다.
교과서적으로는 응답 전용 DTO(Data Transfer Object)를 따로 두어야 하지만, 두 형태가 거의 같은 이 앱에서는 변환 코드만 늘어난다.
또 `Handlers`가 `*store.Store` 구체 타입에 직접 의존하므로, 스토어를 모의 객체(mock)로 바꾸는 핸들러 단위 테스트를 하려면 인터페이스 추출이 먼저 필요하다.
처음부터 계층을 겹겹이 쌓기보다, API 응답과 내부 모델이 갈라지거나 핸들러가 두꺼워져 필요가 증명될 때 분리하는 편이 작은 프로젝트에는 맞다.

## 정리

이번 장에서는 Gin으로 Echo Flip의 HTTP API를 구성한 방식을 살펴봤다.

Go 1.22 이후의 `net/http`만으로도 서버는 만들 수 있지만, 라우트 그룹·JSON 바인딩·미들웨어 체인이 30개 가까운 엔드포인트의 반복 코드를 줄여 주고 넓은 사용자 층이 AI 에이전트의 코드 생성 정확도까지 높여 준다는 점에서 Gin을 선택했다.
의존성을 최소화하려면 net/http, 표준 인터페이스 호환이 중요하면 chi, 에러 반환형 핸들러를 선호하면 Echo가 더 나은 선택일 수 있다.

구조 면에서는 pkg/app/app.go가 조립한 `*gin.Engine`을 `sync.Once` 싱글턴으로 제공하고, 로컬 서버(cmd/server)와 Vercel 함수(api/index.go)가 이를 공유한다.
`*gin.Engine`이 표준 `http.Handler`라는 사실이 이 공유를 가능하게 하며, Vercel 빌더가 `internal` 패키지를 가져올 수 없다는 제약이 조립 코드를 `pkg/`에 둔 이유다.

핸들러는 `gin.Context` 하나로 파라미터를 읽고 `c.JSON`으로 응답하며, 바인딩·검증 실패는 `badRequest`와 `fail` 도우미로 통일해 처리한다.
미들웨어 체인은 Recovery → CORS → JWT 인증 → 프로필 보장 순으로 흐르고, 인증 미들웨어가 실어 준 사용자 ID를 모든 핸들러가 `auth.UserID(c)`로 꺼내 쓴다.
마지막으로 handlers(HTTP 관심사)와 store(DB 접근)의 계층 분리가 변경 범위 예측과 테스트 용이성을 어떻게 확보하는지 확인했다.

다음 장에서는 시선을 프런트엔드로 돌려, TypeScript가 이 API의 응답을 어떻게 타입으로 받아 안전하게 다루는지 살펴보겠다.
