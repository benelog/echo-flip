# 19장 Supabase 데이터베이스: pgx 연결과 개발·운영 DB 분리

18장에서 인증을 마쳤으니, 검증을 통과한 요청은 이제 데이터베이스로 내려간다.

그런데 이 앱에는 이미 데이터베이스가 있다.
1부에서 앱은 환경 변수 하나 없이 `go run ./cmd/server`로 떠서, SQLite 파일 하나에 덱과 학습 기록을 쌓는 것으로 완성됐다(14장).
이 장에서는 그 앱을 운영 데이터베이스, 즉 Supabase의 관리형 PostgreSQL로 옮긴다.

먼저 이 전환이 코드 수정이 아니라 환경 변수 하나로 끝나는 구조를 확인하고, 3장에서 설계한 스키마가 PostgreSQL에서 얻는 더 풍부한 타입들을 살펴본다.
이어서 함수 인스턴스가 여럿 뜨는 서버리스 환경에서 커넥션이 폭증하는 문제와 그 해법인 트랜잭션 풀러, 풀러를 쓰는 대가로 pgx에 붙여야 하는 설정, 그리고 사용자 데이터가 살아 있는 채로 스키마를 고치는 마이그레이션을 차례로 짚는다.
마지막으로 함수와 데이터베이스를 같은 리전에 두는 콜로케이션, 브라우저의 직접 접근 통로를 잠그는 RLS 전략, 개발용과 운영용 데이터베이스의 분리, 이 모든 연결을 묶는 환경 변수 구성을 정리한다.

## SQLite에서 PostgreSQL로

1부의 로컬 모드에서 데이터베이스는 `echo-flip.db`라는 파일 하나였고, 그 단순함이 "내 컴퓨터에서 완결되는 앱"을 만들었다.
운영 환경에서는 이 구성이 성립하지 않는다.
17장에서 봤듯 서버리스 함수 인스턴스는 언제든 회수되는데, 파일시스템도 인스턴스와 함께 사라지는 일회용 공간이라 거기에 쓴 SQLite 파일은 그대로 증발한다.
트래픽에 따라 인스턴스가 여러 개 뜨는데 각자 자기만의 파일시스템을 가지므로, 파일 하나를 모두가 함께 보는 방법도 없다.
데이터는 함수 바깥에, 모든 인스턴스가 접속할 수 있는 별도의 데이터베이스 서버에 있어야 한다.
1장에서 예고한 대로 그 자리는 PostgreSQL의 몫이고, 관리형 PostgreSQL로 Supabase를 골랐다(18장).

### DATABASE_URL이 모드를 가른다

이 전환에서 가장 중요한 사실은 코드가 바뀌지 않는다는 것이다.
연결 문자열을 담은 환경 변수 `DATABASE_URL` 하나를 주느냐 마느냐가 전부다.

::: info [용어 풀이] 환경 변수(Environment Variable)
프로그램이 실행될 때 운영체제로부터 건네받는 이름표 붙은 값이다.
접속 주소나 비밀번호처럼 환경마다 달라지는 값을 코드에 직접 적지 않고 바깥에서 주입하려고 쓴다.
같은 코드가 내 노트북에서는 로컬 데이터베이스를, 배포된 서버에서는 운영 데이터베이스를 바라보게 만드는 장치다.
:::

`internal/config/config.go`의 `Load`가 그 갈림길이다.
`DATABASE_URL`의 유무로 데이터베이스 드라이버와 인증 방식을 함께 결정하는 코드다.

```go
	if cfg.DatabaseURL != "" {
		cfg.Driver = "postgres"
		cfg.AuthMode = "supabase"
		// ... (JWKS URL 또는 JWT 시크릿 필수 검사)
		return cfg, nil
	}

	// No DATABASE_URL: run in local single-user mode on a SQLite file. On
	// Vercel that would silently write to the function's throwaway filesystem,
	// so a missing DATABASE_URL there is always a misconfiguration.
	if os.Getenv("VERCEL") != "" {
		return nil, fmt.Errorf("DATABASE_URL is required on Vercel")
	}
	cfg.Driver = "sqlite"
	cfg.AuthMode = "local"
	// ...
```

`DATABASE_URL`이 있으면 PostgreSQL과 Supabase 인증, 없으면 SQLite와 고정 로컬 사용자다.
데이터베이스와 인증이 한 몸으로 갈리는 것은 우연이 아니다.
여러 사용자의 데이터가 한곳에 모이는 순간 "누구의 요청인가"를 가리는 진짜 인증이 필요해지고, 내 컴퓨터의 파일 하나짜리 DB에는 사용자가 나뿐이다.

가운데의 `VERCEL` 검사는 이 분기의 안전장치다.
Vercel은 자기 위에서 도는 프로세스에 `VERCEL`이라는 환경 변수를 심어 주는데, 거기서 `DATABASE_URL`이 없다는 것은 설정 실수일 수밖에 없다.
가드가 없었다면 함수가 일회용 파일시스템에 SQLite 파일을 만들어 겉으로는 동작하면서 데이터를 조용히 흘렸을 텐데, 이 검사가 그것을 명확한 기동 실패로 바꾼다.

### 스토어 교체는 인터페이스 한 장 뒤에 숨는다

환경 변수 하나로 데이터베이스가 통째로 바뀌는데 핸들러 코드는 어떻게 그대로일까.
답은 7장에서 본 handlers→store 계층 분리에 있다.
`internal/handlers/handlers.go`의 첫머리에는 핸들러가 저장소에 요구하는 계약이 Go 인터페이스(interface)로 선언되어 있다.
인터페이스는 메서드의 이름과 모양만 나열한 목록으로, 그 목록을 전부 갖춘 타입이면 무엇이든 이 자리에 들어올 수 있다.

```go
type Store interface {
	GetOrCreateProfile(ctx context.Context, userID uuid.UUID, displayName string) (store.Profile, error)

	ListDecks(ctx context.Context, userID uuid.UUID) ([]store.Deck, error)
	CreateDeck(ctx context.Context, userID uuid.UUID, name string, description *string) (store.Deck, error)
	// ... (덱·카드·세션·공유·스마트 덱·통계에 걸쳐 모두 32개 메서드)

	DailyStats(ctx context.Context, userID uuid.UUID, tz string, days int) ([]store.DailyStat, error)
}
```

핸들러는 이 목록에 있는 메서드만 부르고, 그 뒤에 무엇이 있는지 모른다.
이 계약을 만족하는 구현이 둘 있는데, pgx로 PostgreSQL에 붙는 `internal/store`와 1부에서 만든 SQLite 구현 `internal/litestore`다.
두 구현은 SQL 방언만 다를 뿐 행 타입과 `ErrNotFound` 같은 오류 값은 `internal/store`의 것을 함께 쓰므로, 핸들러 입장에서는 어느 쪽이 꽂혀도 응답이 같다.

어느 구현을 꽂을지는 진입점이 정한다.
`cmd/server/main.go`에서 발췌한 다음 코드는 설정의 드라이버 값에 따라 SQLite 스토어 또는 PostgreSQL 엔진을 조립한다.

```go
	var engine *gin.Engine
	if cfg.Driver == "sqlite" {
		s, err := litestore.Open(cfg.SQLitePath)
		// ...
		engine = app.New(cfg, s)
	} else {
		engine, err = app.Engine()
		// ...
	}
```

Vercel 함수의 진입점 `api/index.go`가 부르는 `pkg/app`의 `Engine()`은 PostgreSQL 전용이고, `pkg/app`은 litestore를 아예 import하지 않으므로 서버리스에 올라가는 바이너리에는 SQLite 코드가 링크조차 되지 않는다.

정리하면 스토어 교체가 인터페이스 한 장 뒤에 숨는다.
1부에서 SQLite로 만들고 검증한 핸들러, 프런트엔드, 학습 로직이 한 줄도 바뀌지 않은 채, 이 장의 나머지가 다루는 운영 데이터베이스 위에서 그대로 돈다.

## 같은 설계, 더 풍부한 타입

3장에서 한 설계(일곱 테이블, 외래 키와 cascade, 조회 패턴에서 역산한 인덱스)는 PostgreSQL에서도 그대로고, 바뀌는 것은 표현이다.
SQLite는 타입의 가짓수를 최소로 줄인 대신 어디서나 도는 쪽을 택한 DB라 3장의 스키마는 많은 것을 `text` 열에 눌러 담았는데, PostgreSQL은 그 자리마다 전용 타입을 내준다.

| 3장의 SQLite 표현 | 운영 PostgreSQL |
|---|---|
| `text` (Go가 만들어 넣는 UUID 문자열) | `uuid` 타입 + `gen_random_uuid()` 기본값 |
| `text` (고정 폭 UTC 문자열) | `timestamptz` |
| `text` (JSON 문자열) | `jsonb` |
| `text` (JSON 배열 문자열) | `text[]` 배열 + GIN 인덱스 |
| `text` + `check` 제약 | `enum` 타입 |
| `integer primary key autoincrement` | `bigint generated always as identity` |

운영 스키마의 출발점인 `internal/db/migrations/000001_init.up.sql`에서 발췌한다.
사용자와 카드 테이블을 PostgreSQL 타입으로 만드는 코드로, 3장의 SQLite 스키마와 나란히 놓고 읽으면 대응이 바로 보인다.

```sql
create type card_type as enum ('word', 'sentence', 'idiom');

create table profiles (
  id uuid primary key,
  display_name text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  -- ...
  front_text text not null,
  back_text text not null,
  card_type card_type not null default 'word',
  tags text[] not null default '{}',
  -- ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

카드의 두 열이 `text`·`meaning`이 아니라 `front_text`·`back_text`라는 첫 이름으로 등장하는데, 이 이름이 왜 바뀌었는지는 뒤의 마이그레이션 절에서 확인한다.

`settings`의 `jsonb`는 JSON을 문자열이 아니라 파싱된 이진 형태로 저장하는 타입으로, 넣을 때 문법이 검증되고 내부 필드 조회와 인덱스도 가능하다.
`card_type`은 3장에서 `check` 제약으로 흉내 냈던 값 목록이 enum 타입이 된 모습으로, 타입 자체가 문서가 되고 저장 공간도 작지만 값 목록 변경이 DDL이고 특히 값 제거는 불가능에 가깝다는 대가가 있다.
이 비용도 마이그레이션 절에서 실제 사례로 확인한다.

### 기본 키: 데이터베이스가 UUID를 만든다

`profiles.id`에는 `default`가 없다.
이 값은 DB가 만들지 않고 Supabase Auth가 발급한 사용자 UUID를 그대로 받아 쓰기 때문이다.
18장에서 본 JWT의 사용자 식별자가 바로 이 값이라, 인증의 식별자와 앱 데이터의 식별자가 일치해 조인 없이 토큰의 사용자 ID로 바로 조회할 수 있다.
로컬 모드에서는 고정 로컬 사용자의 ID 하나가 이 자리를 채우고 있었다.

나머지 테이블의 `id`는 `default gen_random_uuid()`로 DB가 직접 만든다.
SQLite에는 UUID 타입도 생성 함수도 없어 Go 코드가 만들어 넣었지만, PostgreSQL에서는 스키마가 스스로 해결한다.

UUID를 기본 키로 삼은 이유를 다시 짚어 두자.
순번 키는 값 자체가 정보를 누설해서, `/cards/42` 같은 URL은 전체 카드 수를 드러내고 이웃 ID를 추측하게 만들지만 UUID는 추측이 불가능하다.
값이 전역에서 유일하므로 로컬 SQLite의 행을 운영 DB로 옮기는 것 같은 환경 간 이동에서도 충돌 걱정이 없고, Supabase Auth의 사용자 식별자가 UUID라서 `profiles.id`와 자연스럽게 이어진다.

물론 공짜는 아니다.
UUID는 16바이트로 bigint의 두 배 크기이고, 값이 무작위라서 새 행이 인덱스의 정렬 순서상 매번 다른 위치에 꽂혀 빠르게 대량으로 쌓이는 작업에 불리하다.
그래서 빠르게 쌓이고 외부에 노출되지 않는 `review_logs`에는 순번 키(`bigint generated always as identity`)를 써서 "노출되는 것은 UUID, 내부 대량 로그는 순번"이라는 이원 전략을 취했고, 3장의 SQLite에서는 `integer primary key autoincrement`가 그 자리를 맡았다.

### 시간대를 품은 타임스탬프

모든 시각 컬럼은 `timestamp`가 아니라 `timestamptz`(timestamp with time zone)다.
`timestamptz`는 값을 UTC 기준 절대 시각으로 저장하고 세션 시간대에 따라 변환해 보여 주는 반면, `timestamp`는 시간대 정보가 없는 벽시계 값이라 서버·클라이언트·DB의 시간대가 어긋나는 순간 버그의 온상이 된다.
PostgreSQL 커뮤니티가 입을 모아 "항상 timestamptz를 써라"라고 권고하는 이유다.
3장의 SQLite에는 시간 타입 자체가 없어 고정 폭 UTC 문자열로 저장하고 문자열 비교가 곧 시간 비교가 되게 맞췄는데, 그 수공업이 여기서는 타입 하나로 끝난다.

실전에서는 `internal/store/stats.go`의 일별 통계 쿼리가 복습 시각을 UTC로 쌓아 두고, 조회할 때 `reviewed_at at time zone $2`처럼 사용자의 IANA 시간대(예: `Asia/Seoul`)로 변환해 "그 사용자의 하루" 단위로 집계한다.
서울의 자정과 뉴욕의 자정이 서로 다른 UTC 시각이어도 저장은 하나의 기준으로 하고 해석만 사용자별로 바꾸면 되며, 학습 streak(연속 학습일) 계산도 같은 방식이다.

### 배열과 GIN 인덱스

카드의 태그는 `text[]` 배열 컬럼이고, 스마트 덱의 태그 규칙은 `tags && $2`라는 배열 겹침(overlap) 연산으로 태그가 하나라도 겹치는 카드를 찾으며, 이 연산을 000001의 `create index cards_tags_gin on cards using gin (tags)` 인덱스가 받친다.
2장에서 본 B-tree 인덱스는 한 칸에 값 하나가 든 경우를 정렬해 찾는 구조라 배열 안의 개별 원소는 훑지 못한다.
GIN(Generalized Inverted Index)은 "값 → 그 값을 가진 행"의 방향으로 뒤집어 둔 역색인 구조라, 태그 배열에 특정 태그가 든 카드를 바로 찾는다.

SQLite 구현은 배열 타입이 없으니 태그를 JSON 배열 문자열로 저장하고, `internal/litestore/rules.go`가 `json_each` 함수로 배열을 행으로 풀어 하나씩 대조한다.
혼자 쓰는 로컬 모드에서는 이 차이가 체감되지 않지만, 여러 사용자의 카드가 쌓이는 운영에서는 전용 타입·연산자·인덱스 조합의 속도가 응답 시간으로 나타난다.

## 서버리스와 커넥션 풀

스키마 이야기를 마쳤으니 연결 이야기로 넘어가자.
겉보기에는 연결 문자열 하나 넘기는 단순한 일이지만, 서버리스에서는 이 장에서 가장 함정이 많은 주제다.

### pgx를 고른 이유

`go.mod`의 DB 관련 의존성은 세 개로, PostgreSQL 드라이버 `github.com/jackc/pgx/v5`, SQLite 드라이버 `modernc.org/sqlite`, 그리고 잠시 뒤에 볼 마이그레이션 도구 `github.com/golang-migrate/migrate/v4`다.
1부의 litestore가 쓰는 `modernc.org/sqlite`는 Go 표준 `database/sql` 인터페이스에 꽂는 드라이버였다.
Go에서 PostgreSQL에 접속하는 정석도 같은 `database/sql`에 드라이버를 꽂는 방식이고 오랫동안 `lib/pq`가 그 자리를 지켰지만, `lib/pq`는 유지보수 모드로 전환되었고 프로젝트 스스로 pgx로 갈아탈 것을 권한다.

pgx는 PostgreSQL 전용 드라이버로, 표준 인터페이스를 거치지 않는 자체 API를 제공한다.
Postgres의 타입과 프로토콜을 직접 다루므로 성능이 좋고, 커넥션 풀(`pgxpool`)이 내장되어 있으며, 무엇보다 쿼리 실행 모드를 세밀하게 제어할 수 있다.
마지막 특성이 잠시 뒤 결정적으로 중요해진다.

`database/sql` 인터페이스가 나은 경우도 분명히 있다.
DB 종류를 바꿀 가능성이 있거나 `sqlx` 같은 표준 인터페이스 기반 생태계를 활용하고 싶다면 그쪽이 맞다.
Echo Flip에도 DB가 둘 있지만 그 추상화는 드라이버 계층이 아니라 앞서 본 Store 인터페이스 계층에서 해결했으므로, PostgreSQL 쪽은 추상화 계층을 걷어내고 pgx 네이티브 API를 그대로 쓸 수 있다.

### 서버리스에서 커넥션이 폭증하는 문제

상주 서버에서는 프로세스가 하나, 풀이 하나이므로 풀 크기가 곧 커넥션 상한이다.
서버리스는 다르다.
동시 요청이 늘면 플랫폼이 함수 인스턴스를 여러 개 띄우고 인스턴스마다 자기만의 풀을 만들기 때문에, 총 커넥션 수는 "인스턴스 수 × 풀 크기"가 되고 인스턴스 수는 우리가 통제할 수 없는 변수다.

한편 PostgreSQL의 커넥션은 연결마다 서버 쪽 프로세스가 하나씩 붙어 메모리를 소비하는 값비싼 자원이라, 무료 티어의 작은 인스턴스가 감당하는 직접 연결은 수십 개 수준에 불과하다.
트래픽이 몰려 인스턴스가 불어나면 `max_connections`가 소진되고, DB는 멀쩡한데 연결이 안 되는 장애가 난다.

### 트랜잭션 풀러와 simple protocol

이 문제의 표준 해법이 연결 풀러(connection pooler)로, Supabase는 Supavisor라는 풀러를 함께 제공한다.
클라이언트는 풀러에 연결하고, 풀러가 소수의 실제 Postgres 커넥션을 여러 클라이언트에게 나눠 쓰게 한다.

::: info [용어 풀이] 커넥션 풀러(트랜잭션 풀러와 세션 풀러)
수많은 클라이언트가 저마다 DB에 직접 연결하는 대신, 소수의 실제 연결을 가운데서 빌려주고 돌려받게 하는 중개자다.
트랜잭션 풀러는 트랜잭션 하나가 도는 동안만 연결을 빌려주고 끝나면 곧바로 회수하고, 세션 풀러는 접속이 끝날 때까지 한 연결을 계속 쥐게 한다.
공용 회의실을 회의 한 건 단위로 빌려주느냐, 한 사람에게 하루 종일 배정하느냐의 차이로 볼 수 있다.
:::

풀러의 트랜잭션 모드(포트 6543)는 트랜잭션 하나가 실행되는 동안만 실제 커넥션을 빌려주고, 끝나면 즉시 회수해 다른 클라이언트에게 준다.
함수 인스턴스가 아무리 늘어나도 실제 DB 커넥션은 소수로 유지되므로 서버리스와 궁합이 가장 좋다.

공짜는 아니다.
같은 클라이언트라도 트랜잭션마다 다른 실제 커넥션에 배정될 수 있으므로, 커넥션(세션)에 상태가 남는 기능은 쓸 수 없다.
대표적인 것이 준비된 구문(prepared statement)이다.
pgx는 기본적으로 확장 프로토콜(extended protocol)로 쿼리를 준비해 캐시하는데, 준비해 둔 커넥션과 다음 쿼리가 실행될 커넥션이 다르면 "prepared statement가 존재하지 않는다"는 오류가 난다.

::: info [용어 풀이] 프리페어드 스테이트먼트(Prepared Statement)
같은 모양의 쿼리를 반복해서 쓸 때, DB에 미리 한 번 분석·준비시켜 두고 이후에는 값만 바꿔 빠르게 실행하는 방식이다.
자주 쓰는 서류 양식을 미리 만들어 두고 빈칸만 채워 넣는 것과 같다.
다만 준비해 둔 연결과 실제로 실행하는 연결이 다르면, 미리 만들어 둔 양식이 그 연결에는 없어서 이 방식을 쓸 수 없다.
:::

이 모든 사정이 `internal/db/db.go`에 압축되어 있다.
DB 커넥션 풀을 프로세스에서 단 하나만 만들어 돌려주는 함수다.

```go
func Pool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	poolOnce.Do(func() {
		cfg, err := pgxpool.ParseConfig(databaseURL)
		if err != nil {
			poolErr = fmt.Errorf("parse DATABASE_URL: %w", err)
			return
		}
		cfg.MaxConns = 4
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
		pool, poolErr = pgxpool.NewWithConfig(ctx, cfg)
	})
	return pool, poolErr
}
```

세 가지 결정이 담겨 있다.
첫째, `sync.Once`로 풀을 프로세스당 하나만 만들어 웜 인스턴스가 호출 간에 재사용한다(18장에서 본 JWKS 클라이언트와 같은 패턴이다).
둘째, `MaxConns = 4`로 풀을 작게 잡아 인스턴스가 늘어도 폭증의 기울기를 낮춘다.
셋째, `QueryExecModeSimpleProtocol`로 단순 프로토콜(simple protocol)을 강제해, 쿼리를 준비 단계 없이 한 번에 보내므로 트랜잭션 풀러에서도 안전하다.

단순 프로토콜에서 파라미터는 pgx가 안전하게 이스케이프한 텍스트로 쿼리에 인코딩되므로 SQL 주입 걱정은 없다.
대신 확장 프로토콜의 바이너리 인코딩과 구문 재사용 이점을 포기하는 것인데, 이 앱의 쿼리 규모에서는 측정조차 어려운 차이다.
풀러와의 호환성을 성능 미세 손실과 맞바꾼, 남는 장사다.

## 마이그레이션: 운영 중에 틀을 고친다

연결이 됐으니 이제 그 DB에 테이블을 만들 차례인데, 스키마는 한 번 만들고 끝나지 않는다.
요구사항이 바뀌면 운영 중인 DB의 틀을 고쳐야 하고, 로컬과 운영은 이 문제를 전혀 다르게 푼다.

### 로컬은 통째로, 운영은 순서대로

1부의 로컬 모드는 스키마를 관리한 적이 없다.
`internal/litestore`의 `Open`이 서버를 켤 때마다 바이너리에 임베드된 `schema.sql`을 통째로 적용하기 때문이다(14장).
이 파일은 완성형 스키마 한 장이고, 모든 문장이 `create ... if not exists`라 몇 번을 실행해도 결과가 같다.
이 방식이 허용되는 것은 로컬 DB의 데이터가 나 하나의 것이기 때문으로, 스키마가 크게 바뀌어 파일과 어긋나면 `echo-flip.db`를 지우고 새로 시작해도 잃는 것이 내 학습 기록뿐이다.

운영 DB는 사용자의 덱과 학습 기록이 살아 있는 채로 틀을 고쳐야 하므로, "지우고 새로 만들기"는 선택지에 없다.
지금 스키마가 어느 버전인지, 다음 버전으로 가려면 무엇을 실행해야 하는지가 명시적으로 남아 있어야 하고, 그 답이 순서 있는 마이그레이션이다.

::: info [용어 풀이] 마이그레이션(Migration)
데이터베이스 구조를 바꾸는 절차를, 순서 있는 변경 스크립트 파일로 남겨 관리하는 방식이다.
"이 표에 열을 추가한다" 같은 변경을 코드처럼 파일로 기록해 git에 쌓아 두면, 다른 환경에서도 같은 파일을 순서대로 실행해 똑같은 구조에 도달한다.
스키마의 변경 이력을 손으로 기억하는 대신 파일로 남기는, 데이터베이스판 버전 관리다.
:::

### golang-migrate와 버전 관리

`internal/db/migrations/` 디렉터리에는 `000001_init`부터 `000004_deck_seq`까지 네 버전이 있고, 버전마다 적용(up)과 되돌리기(down) 스크립트가 쌍을 이뤄 모두 여덟 파일이다.
파일명의 앞자리 숫자가 버전이라, 어떤 환경이든 "현재 버전에서 최신 버전까지의 up을 순서대로 실행"하는 것만으로 같은 스키마에 도달하니 스키마의 형상 관리(version control)를 코드와 같은 git 저장소에서 하게 된다.
1부의 `schema.sql`이 이 네 마이그레이션을 모두 적용한 결과를 SQLite 방언으로 눌러 담은 한 장이라는 사실도 이제 말할 수 있다.

실행 도구는 golang-migrate 라이브러리다.
`internal/db/migrate.go`의 핵심을 보자.
마이그레이션 파일 중 아직 적용되지 않은 것만 순서대로 실행하는 함수다.

```go
//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate applies all pending migrations. It needs a direct (non transaction-
// pooled) connection because golang-migrate takes an advisory lock.
func Migrate(databaseURL string) error {
	src, err := iofs.New(migrationsFS, "migrations")
	// ...
	m, err := migrate.NewWithSourceInstance("iofs", src, "pgx5://"+trimScheme(databaseURL))
	// ...
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	// ...
}
```

`//go:embed`는 SQL 파일을 컴파일 시점에 바이너리 안에 넣는 Go 기능으로, litestore가 `schema.sql`을 품는 것과 같은 수법이다.
golang-migrate는 `schema_migrations` 테이블에 현재 버전을 기록해 두고 미적용분만 실행하며, 적용 중에는 PostgreSQL 권고 잠금(advisory lock)을 잡아 동시 실행을 막는다.
권고 잠금은 특정 행이 아니라 약속된 이름 하나를 잠그는 기능으로, "지금 누군가 마이그레이션 중"이라는 팻말을 DB에 걸어 두는 용도다.

### 마이그레이션은 direct 연결로

함수 주석의 "direct connection"이 바로 이 잠금 때문에 생기는 제약이다.
앞에서 API 쿼리는 트랜잭션 풀러를 거치게 만들었지만, 권고 잠금은 세션에 묶이는 상태라서 트랜잭션마다 커넥션이 바뀌는 트랜잭션 풀러에서는 잠금을 잡은 커넥션과 이후 작업 커넥션이 어긋나 오동작한다.
그래서 진입점인 `cmd/migrate/main.go`는 별도의 연결 문자열을 우선 사용한다.

```go
func main() {
	url := os.Getenv("MIGRATE_DATABASE_URL")
	if url == "" {
		url = os.Getenv("DATABASE_URL")
	}
	// ...
}
```

`MIGRATE_DATABASE_URL`에는 직접 연결(포트 5432) 문자열을 넣고, `MIGRATE_DATABASE_URL='<direct 연결 문자열>' go run ./cmd/migrate`처럼 실행한다.
Supabase가 직접 연결이 어려운 네트워크를 위해 제공하는 세션 풀러(포트 5432)도 접속이 끝날 때까지 한 연결을 쥐어 세션 상태가 유지되므로, 같은 용도로 쓸 수 있다.
마이그레이션은 배포할 때 한 번, 커넥션 하나로 끝나는 작업이라 직접 연결의 커넥션 부담이 문제되지 않는다.
정리하면 수시로 열리는 API 쿼리는 트랜잭션 풀러(6543), 가끔 실행되는 세션 상태 의존 작업은 직접 연결(5432)로 용도에 따라 포트가 갈린다.

Echo Flip은 초기 스키마 이후 세 번의 변경을 겪었고 그 이력이 그대로 마이그레이션 파일로 남아 있으니, 요구사항 변화가 마이그레이션으로 이어진 세 사례를 순서대로 보자.

### 사례 1: 덱 공유 기능 추가

"내 덱을 다른 사용자에게 공유하고 싶다"는 요구가 추가됐다.
`internal/db/migrations/000002_sharing.up.sql` 전체다.
덱 테이블에 공유용 열 두 개를 더하고, 공유 slug의 중복을 막는 인덱스를 건다.

```sql
alter table decks
  add column share_slug text,
  add column shared_at timestamptz;

create unique index decks_share_slug_idx on decks (share_slug)
  where share_slug is not null;
```

공유 상태를 별도 테이블이 아니라 `decks`의 nullable 컬럼 두 개로 표현해, `share_slug is null`이면 비공유, 값이 있으면 공유 중이다.
마지막의 인덱스는 부분 유니크 인덱스(partial unique index)로, 표 전체가 아니라 조건에 맞는 행만 골라 중복을 검사한다.
공유 slug는 공유된 덱에만 존재하므로, `where share_slug is not null` 조건 덕분에 공유되지 않은 다수의 덱(NULL)은 인덱스에 아예 들어가지 않으면서 존재하는 slug 사이의 유일성만 강제된다.

### 사례 2: 양방향 카드로의 전환

초기에는 카드가 앞면(front)/뒷면(back)이라는 방향 있는 이름을 갖고 있었는데, "영어→뜻"뿐 아니라 "뜻→영어"로도 학습하는 양방향 요구가 들어오자 이름이 실체와 어긋나게 됐다.
`internal/db/migrations/000003_bidirectional_cards.up.sql`에서 발췌한다.
카드의 두 열 이름을 바꾸고, 학습 방향을 담는 열을 세션 테이블에 추가하는 내용이다.

```sql
alter type card_type add value if not exists 'concept';

create type study_direction as enum ('text_to_meaning', 'meaning_to_text');

alter table study_sessions
  add column direction study_direction not null default 'text_to_meaning';

drop view cards_with_stats;

alter table cards rename column front_text to text;
alter table cards rename column back_text to meaning;

-- ... (cards_with_stats 뷰를 새 컬럼 이름으로 재생성)
```

컬럼 이름을 `text`(외우려는 표현)와 `meaning`(그 뜻)이라는 방향 중립적 이름으로 바꾸고, 방향은 세션의 속성(`direction`)으로 옮겼다.
"방향은 카드가 아니라 학습 세션의 것"이라는 모델링 교정이 이 마이그레이션의 본질이다.
뷰가 컬럼을 참조하고 있어 drop 후 재생성하는 순서도 눈여겨보자.

down 파일에는 스키마 진화의 쓴맛이 기록되어 있다.
`internal/db/migrations/000003_bidirectional_cards.down.sql` 첫머리로, 추가한 enum 값은 제거할 수 없어 그대로 남긴다는 주석이다.

```sql
-- Note: the 'concept' value added to card_type cannot be removed from the
-- enum; it is left in place (rows using it would block a true rollback).
```

PostgreSQL enum은 값을 추가할 수는 있어도 제거할 수 없으므로 이 down은 완전한 역연산이 아니며, 되돌릴 수 없는 변경의 한계를 주석으로 명시해 두는 것이 실무적인 타협이다.
앞서 방언 절에서 말한 "enum은 변경이 비싸다"는 트레이드오프의 실증이기도 하다.

### 사례 3: 덱 slug용 시퀀스

덱 URL을 `/deck?id={uuid}`에서 `/decks/{slug}` 형태의 짧은 경로로 바꾸는 요구가 생겼다.
`internal/db/migrations/000004_deck_seq.up.sql`의 핵심 두 줄이다.
덱마다 자동으로 증가하는 순번을 붙이고, 그 값이 겹치지 않게 제약을 건다.

```sql
alter table decks add column seq bigint generated always as identity;
alter table decks add constraint decks_seq_key unique (seq);
```

`generated always as identity` 컬럼을 추가하면 기존 행에도 순번이 자동으로 채워진다(backfill).
새 컬럼을 추가하는 마이그레이션에서 기존 데이터를 어떻게 채울지는 항상 따라오는 질문인데, identity의 기본 동작이 그 답을 대신해 준 경우다.
이 `seq`를 뒤섞어 4자 URL 코드로 바꾸는 slug 설계는 3장에서 다뤘다.

세 사례의 공통점은 사용자 데이터가 쌓인 뒤에 도착한 요구라는 것이다.
데이터를 보존한 채 열을 더하고 이름을 바꾸고 기존 행을 채우는 일이 모두 순서 있는 파일로 남아, 어떤 환경이든 같은 명령 하나로 같은 스키마에 도달한다.

## 리전 콜로케이션: 함수와 DB를 같은 곳에

17장에서 본 `vercel.json`은 함수 리전을 고정하고 있다.

```json
{
  "regions": ["iad1"]
}
```

그리고 DEPLOY.md의 첫 단계는 Supabase 프로젝트를 만들 때 리전을 East US(North Virginia)로 선택하라고 지시하며 "서울 리전을 고르면 안 됩니다"라고 못박는다.
한국 사용자를 위한 앱인데 왜 서울이 아닐까.

핵심은 왕복 횟수의 비대칭이다.
사용자와 함수 사이는 요청당 한 번 왕복하지만, 함수와 DB 사이는 요청 하나를 처리하며 여러 번 왕복한다.
프로필 확인, 덱 조회, 카드 목록, 학습 기록 갱신처럼 쿼리가 이어지면 API 요청 하나에 DB 왕복이 서너 번은 보통이다.

서울과 버지니아 사이의 왕복 지연(round-trip latency)은 약 180ms다.
함수가 iad1에 있는데 DB가 서울이라면, DB 왕복 4번에 지연만 700ms가 넘게 쌓인다.
반대로 함수와 DB가 같은 리전이면 왕복당 1ms 수준이라 쿼리 횟수가 체감 지연에서 거의 사라진다.
Vercel 무료 티어의 함수 리전 선택지가 제한적이어서 함수를 서울로 옮기는 길이 막혀 있으니, DB를 함수 곁으로 보내는 것이 남은 최선이다.

물론 사용자→함수 구간의 태평양 횡단 180ms는 남지만, 요청당 한 번뿐인 비용이고 정적 자산은 CDN 엣지가 사용자 가까이에서 응답하므로 첫 화면 로딩은 리전과 무관하게 빠르다.
쓰는 플랫폼이 서울 리전 함수를 지원한다면 함수와 DB를 모두 서울에 두는 것이 정답으로, 콜로케이션(colocation)의 원칙은 "함수를 어디에 두든, DB는 반드시 그 옆에"이다.

::: info [용어 풀이] 콜로케이션(Colocation)
서로 자주 대화하는 두 시스템을, 여기서는 함수와 DB를 같은 지역(리전)에 두어 물리적 거리를 좁히는 것이다.
하루에도 수십 번 오가는 두 부서를 같은 층에 배치하는 것과 같아서, 오갈 때마다 드는 시간이 쌓이지 않는다.
멀리 떨어져 있으면 왕복 지연이 요청마다 누적되므로, 대화가 잦을수록 같이 두는 이득이 크다.
:::

## RLS 전략: 정책 0개로 잠근다

Supabase의 PostgreSQL에는 일반적인 DB 서버에 없는 문이 하나 더 있다.
PostgREST라는 관문 서버(게이트웨이)가 붙어 있어, 브라우저 같은 클라이언트가 중간에 API 서버를 두지 않고도 웹 요청으로 테이블을 직접 읽고 쓸 수 있다.
이때 접속자는 `anon`(로그인 전)과 `authenticated`(로그인 후)라는 두 역할 중 하나로 취급되고, 문을 여는 열쇠는 18장에서 본 anon key다.
anon key는 프런트엔드 번들에 들어가는 공개 값이므로, 이 문을 그대로 두면 누구에게나 Go API의 인증·인가 로직을 우회하는 뒷문이 열린다.

Supabase의 표준 설계는 이 직접 접근을 열어 두고 테이블마다 RLS(Row Level Security, 행 수준 보안) 정책으로 "자기 행만 보인다"를 강제하는 것이다.

::: info [용어 풀이] 행 수준 보안(RLS, Row Level Security)
"누가 어떤 행을 볼 수 있는가"를 테이블 안에서 행 단위로 통제하는 PostgreSQL 기능이다.
같은 표를 조회해도 사용자 A에게는 A의 행만, B에게는 B의 행만 보이도록 DB가 걸러 준다.
RLS를 켜면 기본값이 "거부"라서 허용 정책을 하나도 두지 않으면 그 역할에는 아무 행도 보이지 않는데, Echo Flip은 바로 이 성질을 잠금 장치로 쓴다.
:::

Echo Flip은 다른 길을 택해, 모든 데이터 접근을 Go API로만 받고 PostgREST 경로는 원천 차단한다.
`internal/db/migrations/000001_init.up.sql`의 마지막 부분이다.
모든 테이블에 RLS를 켜고, PostgREST가 쓰는 두 역할에게서 기본 접근 권한을 회수하는 코드다.

```sql
-- The Go API is the only client of these tables. Enabling RLS with zero
-- policies blocks Supabase PostgREST access via the anon/authenticated roles,
-- while the table owner (the connection Go uses) bypasses RLS.
alter table profiles enable row level security;
alter table decks enable row level security;
-- ... (모든 테이블에 동일)

-- Belt and braces on Supabase: drop the default grants PostgREST roles get.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  -- ... (authenticated 역할에도 동일)
end $$;
```

동작 원리는 RLS의 기본값 거부(default deny) 성질에 있다.
RLS를 켜면 정책이 허용한 행만 보이는데 정책이 하나도 없으면 아무 행도 보이지 않으므로, "enable + 정책 0개"는 PostgREST 역할에게 모든 테이블이 빈 것처럼 보이게 만드는 잠금 장치다.
반면 Go API는 `DATABASE_URL`의 postgres 역할로 접속하고, 이 역할은 테이블 소유자라서 RLS를 우회한다.
그 아래의 `revoke`는 RLS 설정이 실수로 풀리더라도 권한(grant) 자체가 없으면 접근이 막히게 하는, 벨트에 멜빵을 더한(belt and braces) 이중 잠금이다.
`do $$ ... $$` 블록으로 역할 존재를 확인하는 것은 `anon` 역할이 없는 순정 PostgreSQL에서도 같은 마이그레이션이 돌게 하기 위함이다.

000001과 000003의 뷰 정의에 붙어 있던 `security_invoker = true` 옵션도 이 전략의 일부다.
PostgreSQL 뷰는 기본적으로 소유자 권한으로 실행되므로, 테이블에 걸어 둔 RLS 잠금이 뷰를 거치는 순간 우회될 수 있다.
`security_invoker`를 켜면 뷰가 호출자 권한으로 실행되어, 뷰가 RLS 잠금의 뒷문이 되는 것을 막는다.

RLS 정책 기반 설계라면 CRUD 수준의 화면을 API 코드 없이 클라이언트에서 바로 조회할 수 있고, Supabase의 실시간 구독 같은 부가 기능도 그대로 쓸 수 있으며, 권한 규칙이 데이터와 같은 곳에 있어 어떤 클라이언트가 붙어도 규칙이 일관된다.
클라이언트 종류가 여럿이고 API 서버를 얇게 유지하고 싶다면 정책 기반이 더 나은 선택이다.
반면 인가(authorization) 로직이 SQL 정책으로 흩어져 테이블마다 빠짐없이 작성·검증해야 하고, 정책 하나를 빠뜨리면 그대로 데이터 노출이라는 비용이 있다.

Echo Flip은 어차피 SRS 계산과 트랜잭션 때문에 Go API가 필수였다.
그렇다면 인가를 Go 핸들러 한 곳으로 모으고(store 계층의 모든 쿼리가 `user_id = $1` 조건을 지닌다), DB 접근 경로를 하나로 줄이는 편이 검증할 표면적을 최소화한다.
RLS를 접근 제어 규칙이 아니라 뒷문을 잠그는 자물쇠로 쓴 셈이다.
세션 저장소를 두지 않은 18장의 무상태 인증과 짝을 이루는 결정이다.

## 개발 DB와 운영 DB를 분리한다

여기까지로 운영 DB 하나가 완성됐다.
그런데 이 장의 구성을 실제로 따라 하면 Supabase 프로젝트를 하나가 아니라 둘, 즉 운영용과 개발용을 만들게 된다.

이유는 지금까지의 이야기 안에 이미 있다.
운영 DB는 사용자 데이터가 살아 있는 곳이므로, 거기서 실험하지 않는다.
새 기능의 쿼리를 눌러 보고, 스키마 변경을 시험하고, 잘못된 `delete`를 저지르는 일은 지워도 되는 데이터 위에서 벌어져야 한다.
21장에서 보겠지만 무료 플랜에는 자동 백업조차 없어서, 운영 데이터 위의 실수는 돌아갈 시점이 없는 사고가 된다.

특히 방금 본 마이그레이션이 그렇다.
운영 DB에 처음 실행되는 마이그레이션은 리허설을 이미 거친 뒤여야 한다.
개발 DB가 있으면 새 마이그레이션을 개발 DB에 먼저 적용해 보고, 실패하든 어긋나든 사고의 반경이 개발 데이터 안에 갇힌다.

구성은 Supabase에서 프로젝트를 하나 더 만드는 것이 전부다(예: `echo-flip`과 `echo-flip-dev`).
리전은 콜로케이션 원칙 그대로 운영과 같은 곳으로 맞추고, 프로젝트마다 자기만의 연결 문자열·anon key·JWKS URL이 나온다.
2026년 7월 기준 Supabase 요금 페이지(supabase.com/pricing)는 무료 조직의 활성 프로젝트를 2개까지 허용하므로, 개발·운영 두 프로젝트가 그 한도를 꽉 채운다.
일시정지된 프로젝트는 이 수에 들어가지 않는데, 이 한도가 무료 티어 살림에 갖는 의미는 21장에서 다시 짚는다.

이 두 프로젝트는 15장에서 정한 브랜치 정책, 17장에서 설정한 배포 구분과 한 축으로 정렬된다.

| 층 | 코드 | 배포 | 데이터베이스 |
|---|---|---|---|
| 로컬 | 작업 중인 코드 | 없음 | SQLite 파일(14장) |
| 개발 | `main` 브랜치 | Vercel 프리뷰 배포 | 개발 Supabase 프로젝트 |
| 운영 | `release` 브랜치 | Vercel 프로덕션 배포 | 운영 Supabase 프로젝트 |

배선은 17장에서 본 환경 변수 스코프가 담당한다.
`DATABASE_URL`이라는 같은 이름에 Production 스코프로는 운영 프로젝트의 값을, Preview 스코프로는 개발 프로젝트의 값을 등록해 두면, `main`에 push한 코드는 프리뷰 배포에서 개발 DB를, `release`에 병합한 코드는 운영 배포에서 운영 DB를 바라본다.
`NEXT_PUBLIC_SUPABASE_URL`과 anon key도 프로젝트마다 다르므로 같은 방식으로 스코프를 나눈다.

마이그레이션 적용도 이 순서를 따른다.
첫째, 새 마이그레이션을 개발 DB에 먼저 적용한다(`MIGRATE_DATABASE_URL`에 개발 프로젝트의 직접 연결 문자열).
둘째, `main`에 push해 프리뷰 배포가 개발 DB 위에서 제대로 도는지 확인한다.
셋째, 확인이 끝나면 운영 DB에 같은 명령을 실행한 뒤 `main`을 `release`에 병합해 운영에 반영한다(새 코드가 새 스키마를 전제하므로 마이그레이션이 코드보다 먼저다).

층이 셋인데 부담은 둘이 아니라는 점도 짚어 두자.
일상 개발은 1부의 로컬 SQLite에서 이루어지므로 개발 DB조차 소모하지 않는다.
개발 프로젝트가 실제로 쓰이는 것은 풀러, RLS, 마이그레이션, JWKS 인증처럼 Supabase에 붙어야만 확인되는 것들을 시험할 때뿐이다.
덕분에 개발을 쉬는 동안 개발 프로젝트가 활동 부족으로 먼저 일시정지될 수 있지만, 대시보드에서 깨우면 그만이고 운영 프로젝트에는 아무 영향이 없다.

## 환경 변수 구성: 값이 두 벌이 된다

1부의 로컬 모드에는 환경 변수가 하나도 없었지만, Supabase에 붙는 순간 연결 문자열과 키가 생기고, 프로젝트가 개발·운영 둘이니 그 값도 두 벌이다.
저장소 루트의 `.env.local.example`이 변수의 전체 목록이다.

```bash
# 로컬 모드(1부)는 이 파일이 필요 없다. Supabase에 연결할 때만 .env.local로 복사해서 값을 채운다.
# 웹 (Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# Go API 주소. 생략하면 next dev는 http://localhost:8080, 프로덕션 빌드(Vercel)는 같은 오리진.
# NEXT_PUBLIC_API_URL=http://localhost:8080

# Go API (셸에서 export 하거나 direnv 사용) — Vercel 환경변수에도 동일하게 등록
# DATABASE_URL: Supabase → Connect → Transaction pooler (port 6543) 연결 문자열
DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
# 로컬 개발에서만 필요 (Next dev 서버 → Go API CORS)
ALLOWED_ORIGINS=http://localhost:3000

# 마이그레이션 전용: Direct connection (port 5432) 또는 Session pooler 문자열
MIGRATE_DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

첫 줄의 주석 그대로 이 파일이 필요해지는 것은 Supabase에 연결할 때부터고, 로컬에서 값을 채울 때는 개발 프로젝트의 것을 쓴다.

### 프런트엔드: NEXT_PUBLIC_ 접두사의 의미

Next.js는 프로젝트 루트의 `.env.local` 파일을 스스로 읽는다.
그중 `NEXT_PUBLIC_` 접두사가 붙은 변수만 빌드 시점에 자바스크립트 번들 안에 문자열로 새겨져 브라우저로 내려간다.
접두사가 곧 "이 값은 공개돼도 된다"는 선언이므로, 여기에 비밀을 담으면 그대로 세상에 공개된다.

anon key가 여기 있어도 괜찮은 이유는 두 겹으로, Supabase 설계상 anon key는 인증 요청이 어느 프로젝트 것인지 구분하는 공개 전제의 식별자이고, 앞 절의 RLS 전략 덕분에 이 키로는 어차피 데이터에 접근할 수 없다.

`NEXT_PUBLIC_API_URL`은 로컬 개발에서만 값을 채운다.
프로덕션에서는 정적 페이지와 Go 함수가 같은 오리진에서 서비스되므로 빈 값으로 두고 상대 경로 `/api/...`를 호출한다.

### Go API: 파일이 아니라 셸에서 읽는다

Go 쪽은 `.env` 파일을 읽지 않고, 장 첫머리에서 본 `internal/config/config.go`가 `os.Getenv`로 셸의 환경 변수를 그대로 가져올 뿐이다.
godotenv 같은 라이브러리를 넣지 않은 것은 의도적인 선택이다.
배포 환경인 Vercel은 대시보드에 등록한 값을 프로세스 환경 변수로 주입하므로 파일을 읽는 코드는 로컬에만 필요한 군더더기가 되고, 로컬과 배포가 같은 경로로 설정을 받는 편이 "로컬에서는 되는데 배포하면 안 되는" 부류의 사고를 줄인다.
필수 값이 빠졌으면 서버가 뜨는 시점에 즉시 실패해, 설정 오류를 첫 요청의 알 수 없는 500 오류가 아니라 명확한 메시지로 드러낸다.
`Load`가 JWKS URL과 JWT 시크릿 중 하나만 있으면 통과시키는 조건은 18장에서 본 HS256 폴백과 짝을 이룬다.

각 변수의 성격을 구분해 두자.
`DATABASE_URL`은 DB 비밀번호가 포함된 진짜 비밀로, 유출되면 데이터 전체가 넘어간다.
`NEXT_PUBLIC_` 접두사가 붙지 않았으므로 번들에 새겨지지 않고 서버 측(Vercel 함수 환경 변수)에만 존재한다.
`SUPABASE_JWKS_URL`은 공개키 주소라 비밀은 아니지만 프로젝트마다 달라서 설정으로 뺐다.
`ALLOWED_ORIGINS`는 로컬 전용으로, 로컬에서는 Next 개발 서버(3000)와 Go 서버(8080)의 오리진이 달라 CORS 허용이 필요하지만 프로덕션은 같은 오리진이라 이 변수 자체가 필요 없다.

### direnv: 디렉터리에 들어가면 환경이 따라온다

Go API가 셸의 환경 변수만 본다는 것은, 개발 DB에 붙여 돌리려면 셸에 값이 올라와 있어야 한다는 뜻이다.
`DATABASE_URL='...' go run ./cmd/server`처럼 명령 앞에 붙이는 방식은 한 번은 견딜 만하지만, 서버를 껐다 켤 때마다, 마이그레이션을 돌릴 때마다, 새 터미널 탭을 열 때마다 반복해야 한다.

direnv는 이 반복을 없애는 작은 도구다.
디렉터리에 `.envrc` 파일을 두면, 셸이 그 디렉터리로 들어가는 순간 파일에 적힌 변수를 자동으로 export하고 벗어나면 되돌린다.
패키지 관리자로 설치하고(`brew install direnv` 또는 `sudo apt install direnv`), 셸 설정 파일 맨 아래에 `eval "$(direnv hook bash)"` 한 줄을 넣어 훅을 건다(zsh를 쓰면 bash 자리에 zsh).

그다음 저장소 루트에 `.envrc`를 만들고 개발 프로젝트의 값을 채운다.

```bash
export DB_PW='<개발 프로젝트의 데이터베이스 비밀번호>'
export DATABASE_URL="postgresql://postgres.<project-ref>:${DB_PW}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
export MIGRATE_DATABASE_URL="postgresql://postgres.<project-ref>:${DB_PW}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
export SUPABASE_JWKS_URL='https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json'
export ALLOWED_ORIGINS='http://localhost:3000'
```

비밀번호를 `DB_PW`로 한 번만 적고 두 연결 문자열이 그것을 참조하는 구조를 눈여겨보자.
비밀번호를 바꿀 일이 생겨도 고칠 곳이 한 군데다.
포트가 6543과 5432로 갈린 것은 이 장에서 본 대로 트랜잭션 풀러를 거치는 연결과 세션이 유지되는 연결의 차이다.

파일을 만들면 direnv는 `.envrc is blocked`라는 오류와 함께 일단 거부한다.
낯선 저장소를 클론했을 때 그 안의 `.envrc`가 임의의 셸 명령을 실행할 수 있다는 것을 생각하면 당연한 경계다.
내용을 눈으로 확인한 뒤 `direnv allow`로 승인한다.
이제 저장소 디렉터리로 `cd` 하는 것만으로 다섯 개 변수가 셸에 올라오고, `go run ./cmd/server`도 `go run ./cmd/migrate`도 앞에 아무것도 붙이지 않고 실행된다.
디렉터리를 벗어나면 변수는 사라지므로, 다른 프로젝트의 `DATABASE_URL`과 뒤섞이는 사고도 막아 준다.
direnv를 쓰지 않겠다면 `.env.local`을 셸에서 직접 `source`하거나 명령마다 변수를 앞에 붙이면 되고, 앱은 아무 차이도 알아채지 못한다.

`.envrc`에 운영 프로젝트의 값은 두지 않는다.
운영 값이 늘 셸에 올라와 있으면 개발 DB에 돌릴 마이그레이션을 운영에 돌리는 사고가 명령 한 줄 거리로 가까워지기 때문이다.
운영 DB를 건드리는 일은 마이그레이션 적용처럼 드물고 의식적인 작업뿐이니, 그때만 `MIGRATE_DATABASE_URL='<운영 direct 문자열>' go run ./cmd/migrate`처럼 일회성으로 붙인다.

### 시크릿 관리 주의점

시크릿이 저장소에 새는 사고를 막는 첫 방어선은 `.gitignore`다.

```txt
# env files (can opt-in for committing if needed)
.env*
!.env.local.example

# direnv
.envrc
```

`.env`로 시작하는 모든 파일과 `.envrc`를 무시하되 자리표시자만 담긴 예제 파일만 예외로 커밋한다.
예제 파일에는 `<password>`처럼 형태만 보여 주는 값을 두고, 실제 값은 로컬의 `.env.local`·`.envrc`와 Vercel 대시보드의 환경 변수에만 존재하게 한다.

몇 가지 습관을 덧붙인다.
첫째, 새 변수를 추가할 때 예제 파일에도 반영해 두면 예제 파일이 곧 설정 문서가 된다.
둘째, 유출이 의심되면 즉시 회전한다.
Supabase 대시보드에서 DB 비밀번호를 재설정하면 기존 연결 문자열은 무효가 된다.
셋째, 값이 사는 곳을 환경마다 하나로 정해 둔다.
로컬은 `.envrc`와 `.env.local`(개발 프로젝트 값), 프리뷰와 프로덕션은 Vercel의 스코프별 환경 변수가 그곳이고, 값을 바꿀 때는 개발·운영 두 벌을 각각 확인한다.

## 정리

첫째, 1부에서 SQLite로 완성한 앱은 코드 수정 없이 운영 데이터베이스로 전환된다.
`internal/config`가 `DATABASE_URL`의 유무로 드라이버와 인증 방식을 가르고, 핸들러는 Store 인터페이스만 바라보므로 pgx 구현과 SQLite 구현이 그 뒤에서 교체되며, Vercel에서 `DATABASE_URL`이 없으면 기동을 거부하는 가드가 오설정을 막는다.

둘째, 설계는 같고 타입이 풍부해진다.
3장에서 `text`로 눌러 담았던 자리에 uuid·timestamptz·jsonb·배열·enum·identity가 들어서고, 태그 검색은 GIN 인덱스가 받친다.

셋째, 서버리스에서는 함수 인스턴스가 여럿 뜨면서 커넥션이 폭증하므로 트랜잭션 풀러(6543)를 거치고, 그 대가로 pgx에 simple protocol을 설정한다.
풀러가 커넥션을 트랜잭션 단위로 재사용해 세션에 매인 프리페어드 스테이트먼트가 성립하지 않기 때문이다.

넷째, 운영 스키마는 순서 있는 마이그레이션으로 고친다.
로컬 SQLite는 시작할 때 완성형 스키마를 통째로 적용하면 그만이지만, 운영 DB는 사용자 데이터가 살아 있는 채로 틀을 바꿔야 하므로 golang-migrate의 버전 있는 up/down 파일로 변경 이력을 쌓는다.
권고 잠금이 세션에 묶여 있어 마이그레이션만은 직접 연결(5432)로 붙는다.

다섯째, 함수와 데이터베이스를 같은 리전에 둔다.
요청 하나가 여러 번 왕복하는 API에서 리전 간 지연은 그대로 응답 시간에 누적되므로, `vercel.json`이 함수 리전을 데이터베이스 리전에 맞춰 고정한다.

여섯째, RLS는 "enable + 정책 0개 + revoke"로 PostgREST 경로를 막고 인가를 Go API 한 곳에 모은다.
18장에서 본 무상태 인증과 이 결정이 맞물려, 검증할 표면적이 API 한 곳으로 줄어든다.

일곱째, 데이터베이스는 결국 세 층이 된다.
일상 개발은 로컬 SQLite, `main`의 프리뷰 배포는 개발 Supabase 프로젝트, `release`의 운영 배포는 운영 Supabase 프로젝트를 바라보고, 마이그레이션은 개발 DB에서 리허설을 마친 뒤에야 운영 DB에 닿는다.
그 배선은 Vercel의 스코프별 환경 변수와 로컬의 `.envrc`가 맡으며, 운영 프로젝트의 값은 셸에 상주시키지 않는다.

이것으로 Echo Flip을 이루는 기술과 인프라를 모두 훑었다.
다음 20장부터는 다 만든 앱을 사용자에게 전달하고 오래 운영하는 이야기로 넘어간다.
먼저 브라우저의 웹 앱이 홈 화면에 설치되는 앱이 되는 과정을 살펴본다.
