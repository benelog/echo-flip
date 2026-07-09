# 6장 PostgreSQL 데이터베이스 설계

애플리케이션의 수명은 코드보다 데이터가 길다.
프레임워크는 갈아탈 수 있어도 쌓인 학습 기록은 버릴 수 없기 때문에, 데이터베이스 설계는 앱 전체에서 가장 신중해야 할 결정이다.
관계형 데이터베이스와 PostgreSQL을 선택한 이유는 1장에서 정리했다.
이 장에서는 도입에서 정리한 요구사항이 실제 테이블과 인덱스, 마이그레이션 파일로 구체화되는 과정을 따라가 보겠다.
간격 반복(Spaced Repetition) 상태를 저장하는 데이터 모델과 URL slug 설계, 그리고 Supabase 환경에서의 RLS(Row Level Security) 전략까지 실제 스키마를 근거로 살펴본다.

## 요구사항에서 테이블을 도출하다

도입에서 정리한 기능 요구사항을 다시 꺼내 보면 양방향 카드와 덱·태그, 학습 세션(맞음/틀림 자가 판정, 재도전 라운드), 간격 반복, 통계, 스마트 덱, 덱 공유가 핵심이다.
요구사항의 명사에서 엔티티(entity)를 뽑아 보면 다음과 같이 정리된다.

첫째, **사용자**가 있다. 인증은 Supabase Auth가 맡지만 앱 쪽에도 표시 이름과 설정을 담을 자리가 필요하다 → `profiles`.

둘째, 카드의 묶음인 **덱**과 학습 단위인 **카드**가 있다 → `decks`, `cards`. 태그는 카드의 속성으로 본다.

셋째, 카드마다 **간격 반복 상태**(다음 복습 시각, 난이도 계수 등)가 있다 → `card_srs`.

넷째, 학습은 **세션** 단위로 진행되고, 세션 안에서 카드 한 장에 대한 판정 하나하나가 **복습 기록**이다 → `study_sessions`, `review_logs`.

다섯째, "오답률 높은 카드"처럼 조건으로 정의되는 가상의 덱인 **스마트 덱**이 있다 → `smart_decks`.

이렇게 도출된 일곱 개 테이블이 첫 마이그레이션 `internal/db/migrations/000001_init.up.sql`에 그대로 담겨 있으니 단계적으로 읽어 보겠다.

::: info [용어 풀이] 테이블·행·열(Table·Row·Column)
관계형 데이터베이스가 데이터를 담는 격자로, 스프레드시트의 시트 한 장과 거의 같다.
표 하나가 테이블이고, 가로 한 줄인 행(Row)이 카드 한 장·사용자 한 명 같은 개별 기록이며, 세로 칸인 열(Column)이 이름·생성 시각처럼 기록마다 채우는 항목이다.
아래 `create table` 문은 이 시트의 이름과 열 목록을 미리 정해 두는 일에 해당한다.
:::

### 사용자, 덱, 카드

`internal/db/migrations/000001_init.up.sql`의 앞부분으로, `profiles`(사용자)·`decks`(덱)·`cards`(카드) 세 테이블을 만드는 코드다.

```sql
create type card_type as enum ('word', 'sentence', 'idiom');
create type session_mode as enum ('deck', 'due', 'smart');

create table profiles (
  id uuid primary key,
  display_name text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  deck_id uuid not null references decks(id) on delete cascade,
  front_text text not null,
  back_text text not null,
  card_type card_type not null default 'word',
  tags text[] not null default '{}',
  phonetic text,
  example text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

눈여겨볼 대목을 짚어 보자.

`profiles.id`에는 `default`가 없다.
이 값은 DB가 만들지 않고 Supabase Auth가 발급한 사용자 UUID를 그대로 받아 쓰기 때문이다.
인증 시스템의 식별자와 앱 데이터의 식별자를 일치시키면 조인 없이 JWT의 사용자 ID로 바로 조회할 수 있다(인증 흐름은 10장에서 다룬다).

태그는 별도 테이블이 아니라 `text[]` 배열 컬럼이다.
정석적인 정규화라면 `tags` 테이블과 `card_tags` 연결 테이블을 두겠지만, 이 앱의 태그는 이름 변경이나 태그별 메타데이터 같은 요구가 없고 "이 태그가 붙은 카드 찾기"만 필요하므로 배열 + GIN 인덱스로 조회 요구를 충족하면서 테이블 수와 조인을 줄이는 쪽을 택했다.
태그 자체가 관리 대상이 되는 순간(태그 일괄 개명, 태그 설명 등) 연결 테이블로 옮기는 것이 맞다는 트레이드오프는 기억해 두자.

`cards`에 `deck_id`뿐 아니라 `user_id`도 중복해 둔 점도 설계 결정이다.
덱을 거치지 않고 "이 사용자의 모든 카드"를 자주 조회하기 때문에(due 큐, 스마트 덱), 조인을 한 단계 줄이려는 실용적 비정규화다.

### 카드와 SRS 상태의 분리

카드의 간격 반복 상태만 따로 담는 `card_srs` 테이블을 만드는 코드다.

```sql
create table card_srs (
  card_id uuid primary key references cards(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  ease_factor real not null default 2.5,
  interval_days real not null default 0,
  repetitions int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  correct_count int not null default 0,
  incorrect_count int not null default 0
);
```

SRS 상태를 `cards`의 컬럼으로 넣지 않고 1:1 테이블로 분리했다.
`card_id`가 외래 키이면서 동시에 기본 키라서 "카드당 상태는 정확히 하나"가 스키마 수준에서 보장된다.

::: info [용어 풀이] 기본 키와 외래 키(Primary Key·Foreign Key)
기본 키는 한 행을 유일하게 가리키는 식별 값으로, 표 안에서 같은 값이 두 번 나오지 않게 막는 대표 열이다.
외래 키는 다른 표의 기본 키를 가리키는 열로, "이 카드는 저 덱에 속한다"처럼 표와 표를 잇는 끈이다.
스프레드시트로 치면 한 시트의 칸이 다른 시트의 특정 줄을 가리키도록 약속해 두고, DB가 그 약속이 깨지지 않게 지켜 주는 셈이다.
:::

분리의 이점은 관심사의 결이 다르다는 데 있다.
카드 내용은 사용자가 편집할 때만 바뀌지만 SRS 상태는 복습할 때마다 갱신되므로, 갱신 빈도가 다른 데이터를 분리하면 복습 트랜잭션이 카드 본문 행을 건드리지 않고 잠금 경합의 범위도 좁아진다.
기본값들 덕분에 행을 만들 때는 `card_id`, `user_id`만 넣으면 "지금 바로 복습 대상인 새 카드" 상태로 시작한다.

### 학습 세션과 리뷰 로그

학습 세션과, 판정 하나하나를 남기는 복습 기록, 두 테이블을 만드는 코드다.

```sql
create table study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  mode session_mode not null,
  deck_id uuid references decks(id) on delete set null,
  smart_rule jsonb,
  total_cards int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  completed boolean not null default false
);

create table review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  session_id uuid references study_sessions(id) on delete set null,
  result boolean not null,
  is_retry boolean not null default false,
  reviewed_at timestamptz not null default now()
);
```

`study_sessions.mode`는 학습 방식(덱 전체, due 큐, 스마트 덱)을 enum으로 구분한다.
스마트 덱으로 시작한 세션은 시작 시점의 규칙을 `smart_rule` jsonb에 스냅숏으로 남겨, 규칙이 나중에 수정되거나 삭제돼도 "그때 무엇을 학습했는지"가 보존된다.

`review_logs`는 판정 한 번이 행 하나인 순수 추가(append) 테이블로, `result`는 맞음/틀림, `is_retry`는 재도전 라운드 여부다.
도입에서 정리했듯 재도전 라운드의 판정은 기록은 남기되 SRS에는 반영하지 않는데, 그 구분이 컬럼 하나로 스키마에 새겨져 있어 통계 쿼리들이 `is_retry = false` 조건으로 첫 판정만 골라낸다.

### 스마트 덱과 통계 뷰

조건으로 정의되는 스마트 덱 테이블과, 카드와 SRS 상태를 합쳐 보여 주는 통계용 뷰를 만드는 코드다.

```sql
create table smart_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  rule jsonb not null,
  created_at timestamptz not null default now()
);

create view cards_with_stats with (security_invoker = true) as
select
  c.id, c.user_id, c.deck_id, c.front_text, c.back_text, c.card_type,
  c.tags, c.phonetic, c.example, c.notes, c.created_at,
  s.ease_factor, s.interval_days, s.repetitions, s.lapses, s.due_at,
  s.last_reviewed_at, s.correct_count, s.incorrect_count,
  (s.correct_count + s.incorrect_count) as attempts,
  case when s.correct_count + s.incorrect_count = 0 then 0.0
       else s.incorrect_count::float / (s.correct_count + s.incorrect_count)
  end as error_rate
from cards c
join card_srs s on s.card_id = c.id;
```

스마트 덱은 카드 ID 목록이 아니라 규칙(jsonb)만 저장하고, 학습을 시작하는 순간 규칙을 쿼리로 변환해 실행하므로 항상 최신 상태다.
그 쿼리의 대상이 `cards_with_stats` 뷰(view)로, 카드 내용과 SRS 상태를 조인하고 시도 횟수(`attempts`)와 오답률(`error_rate`)을 파생 컬럼으로 계산해 둔다.
"오답률 0.4 이상" 같은 규칙 조건과 store 계층의 카드 조회가 모두 이 뷰 하나를 바라보므로, 오답률 계산식이 한 곳에만 존재한다.
`security_invoker = true` 옵션은 RLS 절에서 다시 짚겠다.

실제로 규칙이 뷰를 어떻게 조회하는지 `internal/smartrules/rules.go`에서 발췌한다.

```go
func (r Rule) Query() (sql string, args []any) {
	base := "select id from cards_with_stats where user_id = $1"
	switch r.Type {
	case HighError:
		return base + " and attempts >= $2 and error_rate >= $3 order by error_rate desc, attempts desc limit $4",
			[]any{r.MinAttempts, r.MinErrorRate, r.Limit}
	case Tag:
		return base + " and tags && $2 order by created_at desc limit $3",
			[]any{r.Tags, r.Limit}
	// ...
	}
	return "", nil
}
```

`tags && $2`는 배열 겹침(overlap) 연산자로, 앞서 만든 GIN 인덱스가 받쳐 준다.

## 스키마 설계 요소

테이블 도출을 마쳤으니 이제 스키마를 관통하는 설계 요소들을 하나씩 분해해 보겠다.

### 기본 키 전략 — UUID와 identity의 공존

이 스키마의 기본 키는 두 종류다.
사용자에게 노출될 수 있는 엔티티(덱, 카드, 세션 등)는 `uuid primary key default gen_random_uuid()`이고, 내부 로그인 `review_logs`만 `bigint generated always as identity`다.

UUID를 기본으로 삼은 이유는 다음과 같다.
첫째, 순번 키는 값 자체가 정보를 누설한다.
`/cards/42` 같은 URL은 전체 카드 수를 드러내고 이웃 ID를 추측하게 만들지만, UUID는 추측이 불가능해 ID가 API 경로에 노출되는 멀티테넌트 앱에 안전하다.
둘째, 값이 전역에서 유일하므로 환경 간 데이터 이동에서 충돌 걱정이 없다.
셋째, Supabase Auth의 사용자 식별자가 UUID라서 `profiles.id`와 자연스럽게 이어진다.

물론 공짜는 아니다.
UUID는 16바이트로 bigint의 두 배이고, 무작위 값이라 B-tree 인덱스의 삽입 지역성이 나빠 대량 삽입 워크로드에서 불리하다.
그래서 빠르게 쌓이고 외부에 노출되지 않는 `review_logs`에는 identity bigint를 써서, "노출되는 것은 UUID, 내부 대량 로그는 순번"이라는 이원 전략을 취했다.

### 외래 키와 ON DELETE 정책

모든 관계에는 외래 키가 걸려 있고, 삭제 정책은 두 가지로 갈린다.

소유 관계는 `on delete cascade`다.
사용자를 지우면 덱·카드·SRS 상태·세션·로그가 연쇄 삭제되고, 덱을 지우면 카드가, 카드를 지우면 SRS 상태와 리뷰 로그가 따라 지워진다.
"부모 없이 존재할 수 없는 데이터"의 삭제를 DB에 맡긴 덕분에 store 계층의 `DeleteDeck`은 `delete from decks where ...` 한 문장으로 끝난다.

참조 관계는 `on delete set null`이다.
`study_sessions.deck_id`와 `review_logs.session_id`가 그렇다.
덱을 지웠다고 그 덱으로 학습했던 세션 기록까지 지우는 것은 통계 요구사항에 어긋나므로, 기록은 남기되 참조만 끊는다(그래서 두 컬럼은 nullable이다).

cascade는 편리한 만큼 파괴력도 커서, 의도치 않은 연쇄 삭제가 무섭다면 `on delete restrict`로 막고 애플리케이션에서 명시적으로 지우는 보수적 대안도 있다.
이 앱은 소유 계층이 단순하고 깊이가 얕아 cascade의 이득이 위험보다 크다고 판단했다.

### NOT NULL, enum, UNIQUE — 제약을 DB에 맡긴다

필수 값은 모두 `not null`이고, 대부분 `default`가 함께 붙어 있다.
`not null default`는 "값이 없으면 안 되지만 호출자가 매번 챙길 필요는 없다"는 뜻으로, insert 문을 짧게 유지해 준다.

::: info [용어 풀이] 제약(Constraint)
데이터가 지켜야 할 규칙을 DB에 직접 새겨, 어긴 값은 아예 저장되지 않게 막는 장치다.
"이 칸은 비어 있으면 안 된다"(not null), "이 값은 중복되면 안 된다"(unique)처럼 스프레드시트로는 강제하기 어려운 규칙을 DB가 대신 지켜 준다.
규칙을 애플리케이션 코드가 아니라 데이터 곁에 두면, 어떤 경로로 값이 들어와도 규칙이 똑같이 적용된다.
:::

값의 범위 제한은 `check` 제약 대신 enum 타입으로 해결했다.
`card_type`, `session_mode`가 그 예다.
enum은 타입 자체가 문서가 되고 저장 공간도 작지만, 값 목록 변경이 DDL이라는 점이 트레이드오프다.
특히 enum 값은 추가는 쉬워도 제거가 사실상 불가능한데, 이 비용은 뒤의 마이그레이션 절에서 실제 사례로 확인한다.
값 목록이 자주 바뀔 도메인이라면 `text` 컬럼 + `check` 제약, 또는 참조 테이블이 더 유연한 대안이다.

UNIQUE 제약 중에는 부분 유니크 인덱스(partial unique index)가 흥미롭다.
`internal/db/migrations/000002_sharing.up.sql`에서 발췌한다.

```sql
create unique index decks_share_slug_idx on decks (share_slug)
  where share_slug is not null;
```

공유 slug는 공유된 덱에만 존재한다.
`where share_slug is not null` 조건 덕분에 공유되지 않은 다수의 덱(NULL)은 인덱스에 아예 들어가지 않으면서, 존재하는 slug 사이의 유일성만 강제한다.

### 인덱스는 조회 패턴에서 나온다

000001의 인덱스 목록을 보자.

::: info [용어 풀이] 인덱스(Index)
특정 열의 값을 빠르게 찾도록 미리 정렬해 둔 보조 자료구조로, 책 뒤의 찾아보기(색인)와 같은 역할이다.
찾아보기가 있으면 책장을 처음부터 넘기지 않고 원하는 쪽으로 바로 가듯, 인덱스가 있으면 DB가 모든 행을 훑지 않고 원하는 행으로 곧장 간다.
대신 찾아보기를 최신으로 유지하는 품이 들듯, 인덱스도 데이터를 쓸 때마다 갱신 비용을 치른다.
:::

```sql
create index decks_user_idx on decks (user_id);
create index cards_user_idx on cards (user_id);
create index cards_deck_idx on cards (deck_id);
create index cards_tags_gin on cards using gin (tags);
create index card_srs_user_due_idx on card_srs (user_id, due_at);
create index review_logs_user_time_idx on review_logs (user_id, reviewed_at);
create index review_logs_card_idx on review_logs (card_id);
create index study_sessions_user_idx on study_sessions (user_id, started_at);
create index smart_decks_user_idx on smart_decks (user_id);
```

인덱스는 "일단 다 걸어 두는" 것이 아니라 실제 조회 패턴에서 역산해야 한다.
각 인덱스가 어떤 쿼리를 위한 것인지 store 계층과 짝지어 보자.

첫째, `card_srs_user_due_idx (user_id, due_at)`은 이 앱의 핵심 쿼리인 "오늘 복습" 큐를 위한 복합 인덱스다.
`user_id` 등치 조건 뒤에 `due_at` 범위 조건이 오는 형태라 (등치, 범위) 순서의 복합 인덱스가 정확히 들어맞고, `order by due_at`까지 인덱스 순서로 해결된다.

둘째, `cards_tags_gin`은 GIN(Generalized Inverted Index) 인덱스로, 스마트 덱 태그 규칙의 `tags && $2` 배열 연산을 받친다.
일반적인 B-tree 인덱스는 한 칸에 값 하나가 든 경우를 정렬해 찾는 구조라 배열 안의 개별 원소는 훑지 못한다.
그래서 "값 → 그 값을 가진 행"의 방향으로 뒤집어 둔 역색인 구조인 GIN을 써서, 태그 배열에 특정 태그가 든 카드를 빠르게 찾는다.

셋째, `review_logs_user_time_idx (user_id, reviewed_at)`은 `internal/store/stats.go`의 `DailyStats`가 훑는 "최근 N일 복습 기록" 조회용이다.

넷째, 외래 키 컬럼 인덱스(`cards_deck_idx`, `review_logs_card_idx` 등)는 자식 조회를 빠르게 하는 동시에, cascade 삭제 시 자식을 찾는 스캔을 인덱스로 바꿔 준다.
PostgreSQL은 외래 키에 인덱스를 자동으로 만들지 않으므로 이는 설계자가 챙겨야 할 몫이다.

거꾸로 말하면 여기 없는 인덱스도 의도다.
`cards.text`에 인덱스가 없는 것은 카드 본문 검색 기능이 아직 없기 때문으로, 인덱스는 쓰기마다 유지 비용을 내는 자료구조라 조회 요구 없이 미리 만드는 것은 손해다.

### timestamptz — 시간대를 품은 타임스탬프

모든 시각 컬럼은 `timestamp`가 아니라 `timestamptz`(timestamp with time zone)다.
`timestamptz`는 값을 UTC 기준 절대 시각으로 저장하고 세션 시간대에 따라 변환해 보여 주는 반면, `timestamp`는 시간대 정보가 없는 벽시계 값이라 서버·클라이언트·DB의 시간대가 어긋나는 순간 버그의 온상이 된다.
PostgreSQL 커뮤니티가 사실상 "항상 timestamptz를 써라"라고 권고하는 이유다.

이 선택이 실전에서 어떻게 쓰이는지 `internal/store/stats.go`의 일별 통계 쿼리로 확인해 보자.

```go
rows, err := s.pool.Query(ctx,
	`select to_char(reviewed_at at time zone $2, 'YYYY-MM-DD') as day,
	        count(*)::int,
	        (count(*) filter (where result))::int
	 from review_logs
	 where user_id = $1
	   and reviewed_at >= ((now() at time zone $2)::date - ($3::int - 1)) at time zone $2
	 group by day
	 order by day`,
	userID, tz, days)
```

복습 시각은 UTC 절대 시각으로 쌓여 있고, 통계를 낼 때 사용자의 IANA 시간대(`$2`, 예: `Asia/Seoul`)로 변환해 "그 사용자의 하루" 단위로 집계한다.
서울의 자정과 뉴욕의 자정이 서로 다른 UTC 시각이어도 저장은 하나의 기준으로 하고 해석만 사용자별로 바꾸면 되며, 학습 streak(연속 학습일) 계산도 같은 방식이다.

## SRS 데이터 모델

이 앱의 심장인 간격 반복 데이터 모델을 뜯어 보겠다.

### 이진 SM-2 상태 저장

Echo Flip의 SRS는 SM-2 알고리즘의 이진(binary) 변형으로, 원래 SM-2의 0~5점 6단계 평가 대신 맞음/틀림 두 버튼을 품질 5와 2에 대응시킨다.
알고리즘이 다음 상태를 계산하는 데 필요한 값이 곧 `card_srs`의 컬럼 구성이다.
`ease_factor`는 카드의 난이도 계수로, 맞출수록 커지고 틀리면 깎이며 하한 1.3을 가진다.
`interval_days`는 현재 복습 간격, `repetitions`는 연속 정답 횟수, `due_at`이 다음 복습 시각이고, `lapses`·`correct_count`·`incorrect_count`는 알고리즘 입력은 아니지만 통계와 스마트 덱(오답률 규칙)의 재료다.

상태 전이 로직은 `internal/srs/srs.go`에 순수 함수로 분리되어 있다.

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

DB 상태와 계산 로직이 1:1로 대응한다는 점이 요지로, 스키마를 설계할 때 "알고리즘이 다음 계산에 필요로 하는 최소 상태가 무엇인가"를 물으면 컬럼 목록이 저절로 나온다.

### 복습 기록과 상태 갱신 트랜잭션

복습 한 번은 두 테이블을 건드린다.
`review_logs`에 판정을 남기고 `card_srs`의 상태를 전진시키는데, 이 둘은 반드시 함께 성공해야 한다.

::: info [용어 풀이] 트랜잭션(Transaction)
여러 개의 데이터 변경을 하나로 묶어, 전부 반영되거나 전부 취소되게 하는 단위다.
계좌 이체에서 "보내는 쪽 잔액 차감"과 "받는 쪽 잔액 증가"가 반쪽만 성공하면 돈이 사라지듯, 함께 성공해야 하는 작업들을 한 묶음으로 만든다.
중간에 하나라도 실패하면 이미 마친 변경까지 되돌려(rollback), 데이터가 어정쩡한 상태로 남지 않게 한다.
:::
`internal/store/sessions.go`의 `RecordReview`에서 트랜잭션(`tx`)을 연 이후의 핵심만 발췌한다.

```go
var state srs.State
err = tx.QueryRow(ctx,
	`select ease_factor, interval_days, repetitions from card_srs
	 where card_id = $1 and user_id = $2 for update`, cardID, userID).
	Scan(&state.EaseFactor, &state.IntervalDays, &state.Repetitions)
// ...

if _, err := tx.Exec(ctx,
	`insert into review_logs (user_id, card_id, session_id, result, is_retry)
	 values ($1, $2, $3, $4, $5)`,
	userID, cardID, sessionID, result, isRetry); err != nil {
	return out, err
}

now := time.Now()
if isRetry {
	out.DueAt = now
	out.IntervalDays = state.IntervalDays
	return out, tx.Commit(ctx)
}

next, dueAt := srs.Grade(state, result, now)
_, err = tx.Exec(ctx,
	`update card_srs set
	   ease_factor = $3, interval_days = $4, repetitions = $5, due_at = $6,
	   last_reviewed_at = $7,
	   correct_count = correct_count + case when $8 then 1 else 0 end,
	   incorrect_count = incorrect_count + case when $8 then 0 else 1 end,
	   lapses = lapses + case when $8 then 0 else 1 end
	 where card_id = $1 and user_id = $2`,
	cardID, userID, next.EaseFactor, next.IntervalDays, next.Repetitions, dueAt, now, result)
// ...
```

세 가지를 짚어 보자.

첫째, `select ... for update`로 SRS 행에 행 잠금을 건다.
같은 카드에 대한 판정 요청이 동시에 들어와도(더블 클릭, 재시도 등) 읽기-계산-쓰기 사이에 다른 트랜잭션이 끼어들 수 없는데, 잠금 없이 읽은 값으로 계산해 덮어쓰면 갱신 유실(lost update)이 생기기 때문이다.

둘째, `is_retry`면 로그만 남기고 커밋한다.
재도전 라운드는 방금 틀린 카드를 같은 세션에서 다시 넘겨 보는 기능인데, 이를 정답으로 SRS에 반영하면 "1분 전에 본 카드를 또 맞혔다"는 신호로 간격이 부풀어 알고리즘이 오염되므로, 요구사항의 미묘한 규칙 하나가 분기 하나와 컬럼 하나로 구현됐다.

셋째, 정답/오답 카운터 갱신을 `case when $8 then ...` 형태로 SQL 안에서 처리해, 읽어 온 값에 더해 쓰는 방식보다 원자적이고 왕복이 적다.

### "오늘 복습" 큐 쿼리

SRS의 출구는 "지금 복습할 카드를 달라"는 쿼리다.
`internal/store/cards.go`에서 발췌한다.

```go
const cardSelect = `
	select id, deck_id, text, meaning, card_type, tags, phonetic, example,
	       notes, created_at, attempts, error_rate, interval_days, due_at, last_reviewed_at
	from cards_with_stats`

func (s *Store) DueCards(ctx context.Context, userID uuid.UUID, dueBefore time.Time, limit int) ([]Card, error) {
	rows, err := s.pool.Query(ctx,
		cardSelect+` where user_id = $1 and due_at <= $2 order by due_at asc limit $3`,
		userID, dueBefore, limit)
	// ...
}
```

`due_at <= now()`인 카드를 가장 오래 밀린 순서로 가져온다.
뷰를 통하지만 조건과 정렬이 모두 `card_srs` 쪽 컬럼이라, 실행 계획은 앞서 만든 `card_srs_user_due_idx (user_id, due_at)`를 타고 정렬 없이 상위 N건을 끊어 온다.
한편 홈 화면 배지에 쓰이는 같은 파일의 `DueCount`는 카드 본문이 필요 없으므로 뷰를 거치지 않고 `select count(*) from card_srs where user_id = $1 and due_at <= $2`로 `card_srs`만 센다.
같은 질문이라도 필요한 데이터 폭에 따라 접근 경로를 달리하는 작은 최적화다.

## 스키마 진화와 마이그레이션

스키마는 한 번 만들고 끝나지 않는다.
Echo Flip도 초기 스키마 이후 세 번의 변경을 겪었고 그 이력이 마이그레이션 파일로 남아 있다.

::: info [용어 풀이] 마이그레이션(Migration)
데이터베이스 구조를 바꾸는 절차를, 순서 있는 변경 스크립트 파일로 남겨 관리하는 방식이다.
"이 표에 열을 추가한다" 같은 변경을 코드처럼 파일로 기록해 git에 쌓아 두면, 다른 환경에서도 같은 파일을 순서대로 실행해 똑같은 구조에 도달한다.
스키마의 변경 이력을 손으로 기억하는 대신 파일로 남기는, 데이터베이스판 버전 관리다.
:::

### golang-migrate와 버전 관리

`internal/db/migrations/` 디렉터리는 다음 여덟 파일로 구성된다.

```
000001_init.up.sql / .down.sql       000003_bidirectional_cards.up.sql / .down.sql
000002_sharing.up.sql / .down.sql    000004_deck_seq.up.sql / .down.sql
```

파일명의 앞자리 숫자가 버전이고, 버전마다 적용(up)과 되돌리기(down) 스크립트가 쌍을 이룬다.
스키마 변경을 순서 있는 불변 파일로 쌓아 두면 어떤 환경이든 "현재 버전에서 최신 버전까지의 up을 순서대로 실행"하는 것만으로 같은 스키마에 도달하니, 스키마의 형상 관리(version control)를 코드와 같은 git 저장소에서 하게 된다.

실행 도구는 golang-migrate 라이브러리다.
`internal/db/migrate.go`의 핵심을 보자.

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
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}
```

`//go:embed`는 SQL 파일을 컴파일 시점에 바이너리 안에 넣는 Go 기능으로, 덕분에 마이그레이션 실행에 별도 파일 배포가 필요 없다.
golang-migrate는 `schema_migrations` 테이블에 현재 버전을 기록해 두고 미적용분만 실행하며, 적용 중에는 PostgreSQL 자문 잠금(advisory lock)을 잡아 동시 실행을 막는다.
주석의 "direct connection"은 이 자문 잠금 때문에 생기는 Supabase 특유의 제약으로, 왜 트랜잭션 풀링 포트를 거치면 안 되는지는 10장에서 다룬다.

진입점인 `cmd/migrate/main.go`는 `MIGRATE_DATABASE_URL`(없으면 `DATABASE_URL`)에서 접속 문자열을 읽어 `db.Migrate`를 호출하는 짧은 CLI로, `MIGRATE_DATABASE_URL=postgres://... go run ./cmd/migrate`처럼 실행한다.
접속 문자열 환경 변수를 둘로 나눈 것도 위의 직결 연결 요구 때문으로, API 서버는 풀링 포트를, 마이그레이션은 직결 포트를 쓴다.

이제 요구사항 변화가 마이그레이션으로 이어진 세 사례를 순서대로 보자.

### 000002 — 덱 공유 기능 추가

"내 덱을 다른 사용자에게 공유하고 싶다"는 요구가 추가됐다.
`internal/db/migrations/000002_sharing.up.sql` 전체다.

```sql
alter table decks
  add column share_slug text,
  add column shared_at timestamptz;

create unique index decks_share_slug_idx on decks (share_slug)
  where share_slug is not null;
```

공유 상태를 별도 테이블이 아니라 `decks`의 nullable 컬럼 두 개로 표현했다.
`share_slug is null`이면 비공유, 값이 있으면 공유 중이라는 상태 표현이다.
공유가 덱과 1:1이고 속성이 두 개뿐인 현재 요구에서는 테이블 분리가 과하고, 공유별 권한이나 만료 같은 속성이 늘어나면 그때 분리하면 된다.

### 000003 — 양방향 카드로의 전환

초기에는 카드가 앞면(front)/뒷면(back)이라는 방향 있는 이름을 갖고 있었는데, "영어→뜻"뿐 아니라 "뜻→영어"로도 학습하는 양방향 요구가 들어오자 이름이 실체와 어긋나게 됐다.
`internal/db/migrations/000003_bidirectional_cards.up.sql`에서 발췌한다.

```sql
alter type card_type add value if not exists 'concept';

create type study_direction as enum ('text_to_meaning', 'meaning_to_text');

alter table study_sessions
  add column direction study_direction not null default 'text_to_meaning';

drop view cards_with_stats;

alter table cards rename column front_text to text;
alter table cards rename column back_text to meaning;

create view cards_with_stats with (security_invoker = true) as
select
  c.id, c.user_id, c.deck_id, c.text, c.meaning, -- ...
from cards c
join card_srs s on s.card_id = c.id;
```

컬럼 이름을 `text`(외우려는 표현)와 `meaning`(그 뜻)이라는 방향 중립적 이름으로 바꾸고, 방향은 세션의 속성(`direction`)으로 옮겼다.
"방향은 카드가 아니라 학습 세션의 것"이라는 모델링 교정이 이 마이그레이션의 본질이다.
뷰가 컬럼을 참조하고 있어 drop 후 재생성하는 순서도 눈여겨보자.

down 파일에는 스키마 진화의 쓴맛이 기록되어 있다.
`internal/db/migrations/000003_bidirectional_cards.down.sql` 첫머리다.

```sql
-- Note: the 'concept' value added to card_type cannot be removed from the
-- enum; it is left in place (rows using it would block a true rollback).
```

PostgreSQL enum은 값을 추가할 수는 있어도 제거할 수 없으므로, 이 down은 완전한 역연산이 아니며 그 사실을 주석으로 남겨 두었다.
모든 마이그레이션이 깨끗하게 되돌려지는 것은 아니므로, 되돌릴 수 없는 변경은 그 한계를 명시해 두는 것이 실무적인 타협이다.
앞서 말한 "enum은 변경이 비싸다"는 트레이드오프의 실증이기도 하다.

### 000004 — 덱 slug용 시퀀스

덱 URL을 `/deck?id={uuid}`에서 `/decks/{slug}` 형태의 짧은 경로로 바꾸는 요구가 생겼다.
`internal/db/migrations/000004_deck_seq.up.sql`의 핵심 두 줄이다.

```sql
alter table decks add column seq bigint generated always as identity;
alter table decks add constraint decks_seq_key unique (seq);
```

`generated always as identity` 컬럼을 추가하면 기존 행에도 순번이 자동으로 채워진다(backfill).
새 컬럼을 추가하는 마이그레이션에서 기존 데이터를 어떻게 채울지는 항상 따라오는 질문인데, identity의 기본 동작이 그 답을 대신해 준 경우로, 이 `seq`가 어떻게 URL slug가 되는지는 다음 절에서 살펴본다.

## 덱 slug 설계 — 시퀀스에서 URL로

URL 설계는 DB 설계와 맞닿아 있다.
`/decks/9f8c1c2e-...` 같은 UUID URL은 안전하지만 길고 흉하고, `seq`를 그대로 노출한 `/decks/17`은 짧지만 순번이라는 사실 자체가 정보(전체 덱 수, 이웃 덱의 존재)를 흘린다.

Echo Flip의 답은 "순번을 저장하되, 노출 전에 뒤섞는다"이다.
`internal/store/deckslug.go`에서 발췌한다.

```go
const slugAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz"

const slugLen = 4
const slugSpace = 36 * 36 * 36 * 36

// slugMul is coprime to slugSpace (not divisible by 2 or 3, the prime factors
// of 36), which makes multiplication by it modulo slugSpace invertible.
const slugMul = 1038007

var slugMulInv = modInverse(slugMul, slugSpace)

func encodeDeckSlug(seq int64) string {
	if seq <= 0 || seq >= slugSpace {
		return ""
	}
	n := (seq * slugMul) % slugSpace
	var buf [slugLen]byte
	for i := slugLen - 1; i >= 0; i-- {
		buf[i] = slugAlphabet[n%36]
		n /= 36
	}
	return string(buf[:])
}
```

설계 결정을 하나씩 풀어 보자.

첫째, 문자 집합은 Base36(0-9, a-z)이다.
Base62(대소문자 구분)보다 표현력은 낮지만 대소문자를 구분하지 않아 사용자가 slug를 입으로 전달하거나 손으로 입력할 때 혼동이 없으니, 짧은 URL 코드에서는 표현력보다 오독 없는 전달이 더 중요하다는 판단이다.

둘째, 길이는 4자 고정으로, 36⁴ = 1,679,616이므로 전역에서 약 168만 개의 덱까지 표현할 수 있다.
`seq`는 사용자별이 아닌 전역 시퀀스라서 이 값이 서비스 전체 덱 수의 상한이 되는데, 개인 학습 앱의 규모에서는 충분하고, 모자라면 `slugLen`을 늘리면 된다는 한계와 확장 경로가 코드 주석에 명시되어 있다.

셋째, 순번을 감추는 방법으로 곱셈 순열(multiplicative permutation)을 썼다.
아이디어 자체는 단순한데, 순번에 큰 상수를 곱한 뒤 일정한 크기로 나눈 나머지만 남기면 1·2·3처럼 이어지던 값이 서로 멀리 떨어진 코드로 흩어진다.
`slugSpace`와 서로소(coprime)인 상수를 곱하고 나머지를 취하면 1~slugSpace-1 범위 안에서 전단사(bijection)가 되어, 연속된 seq가 흩어진 slug로 변환되면서도 역원(`slugMulInv`)을 곱하면 원래 seq로 정확히 복원된다.
암호학적으로 예측 불가능한 것은 아니므로 비밀 값에는 부적합하지만, 덱 slug는 어차피 소유자 인증 뒤에서만 조회되므로 "순번처럼 안 보이게 하기"면 충분하다.
조회 쪽은 `internal/store/decks.go`의 `GetDeckBySlug`가 `decodeDeckSlug`로 slug를 seq로 되돌린 뒤 `where d.user_id = $1 and d.seq = $2` 조건의 인덱스 조회로 잇는다.
slug 컬럼을 따로 저장하지 않고 `seq`에서 매번 계산하는 점도 특징인데, 전단사 변환이므로 저장할 필요가 없고 `decks_seq_key` 유니크 제약이 곧 slug의 유일성을 보장한다.

대조군으로 공유 slug(`share_slug`)를 보면 다른 선택을 했다.
`internal/store/sharing.go`의 `newShareSlug`는 시퀀스 변환이 아니라 `crypto/rand`로 무작위 5자 Base36 토큰을 만들고, 유니크 인덱스에 부딪히면 새 토큰으로 재시도한다.
개인 덱 slug는 행마다 이미 있는 `seq`에서 결정적으로 유도되니 충돌 자체가 없고, 공유 slug는 공유 시점에 새로 만드는 값이라 무작위 + 충돌 재시도가 단순하다.
같은 앱 안에서도 생성 시점과 유일성 보장 수단에 따라 slug 전략이 달라질 수 있음을 보여 주는 사례다.

## RLS 전략 — 정책 0개로 잠근다

Supabase의 PostgreSQL은 PostgREST라는 게이트웨이가 붙어 있어서, 클라이언트가 API 서버 없이도 `anon`/`authenticated` 역할로 테이블에 직접 접근할 수 있다는 점이 일반적인 DB 서버와 다르다.
Supabase의 표준 설계는 이 직접 접근을 열어 두고 테이블마다 RLS(Row Level Security, 행 수준 보안) 정책으로 "자기 행만 보인다"를 강제하는 것이다.

::: info [용어 풀이] 행 수준 보안(RLS, Row Level Security)
"누가 어떤 행을 볼 수 있는가"를 테이블 안에서 행 단위로 통제하는 PostgreSQL 기능이다.
같은 표를 조회해도 사용자 A에게는 A의 행만, B에게는 B의 행만 보이도록 DB가 걸러 준다.
RLS를 켜면 기본값이 "거부"라서 허용 정책을 하나도 두지 않으면 그 역할에는 아무 행도 보이지 않는데, Echo Flip은 바로 이 성질을 잠금 장치로 쓴다.
:::

Echo Flip은 다른 길을 택했다.
모든 데이터 접근은 Go API를 통해서만 이루어지고, PostgREST 경로는 원천 차단한다.
`internal/db/migrations/000001_init.up.sql`의 마지막 부분이다.

```sql
-- The Go API is the only client of these tables. Enabling RLS with zero
-- policies blocks Supabase PostgREST access via the anon/authenticated roles,
-- while the table owner (the connection Go uses) bypasses RLS.
alter table profiles enable row level security;
alter table decks enable row level security;
alter table cards enable row level security;
-- ... (모든 테이블에 동일)

-- Belt and braces on Supabase: drop the default grants PostgREST roles get.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end $$;
```

동작 원리는 RLS의 기본값 거부(default deny) 성질에 있다.
RLS를 켜면 정책이 허용한 행만 보이는데 정책이 하나도 없으면 아무 행도 보이지 않으므로, "enable + 정책 0개"는 PostgREST 역할에게 모든 테이블이 빈 것처럼 보이게 만드는 잠금 장치다.
반면 테이블 소유자는 RLS를 우회하므로, 소유자 계정으로 접속하는 Go API는 영향을 받지 않는다.
그 아래의 `revoke`는 RLS 설정이 실수로 풀리더라도 권한(grant) 자체가 없으면 접근이 막히게 하는, 벨트에 멜빵을 더한(belt and braces) 이중 잠금이다.
`do $$ ... $$` 블록으로 역할 존재를 확인하는 것은 `anon` 역할이 없는 로컬 순정 PostgreSQL에서도 같은 마이그레이션이 실행되게 하기 위함이다.

앞서 미뤄 둔 뷰의 `security_invoker = true`도 이 전략의 일부다.
PostgreSQL 뷰는 기본적으로 소유자 권한으로 실행되어 기반 테이블의 RLS를 우회한다.
`security_invoker`를 켜면 뷰가 호출자 권한으로 실행되므로, 뷰가 RLS 잠금의 뒷문이 되는 것을 막는다.

이 결정의 트레이드오프를 정리해 보자.

RLS 정책 기반 설계의 장점은 분명하다.
CRUD 수준의 화면이라면 API 코드 없이 클라이언트에서 바로 조회할 수 있고, Supabase의 실시간 구독 같은 부가 기능도 그대로 쓸 수 있으며, 권한 규칙이 데이터와 같은 곳에 있어 어떤 클라이언트가 붙어도 규칙이 일관된다.
클라이언트 종류가 여럿이고 API 서버를 얇게 유지하고 싶다면 정책 기반이 더 나은 선택이다.
반면 인가(authorization) 로직이 SQL 정책으로 흩어져 테이블마다 빠짐없이 작성·검증해야 하고, 정책 하나를 빠뜨리면 그대로 데이터 노출이라는 비용이 있다.
복잡한 도메인 규칙(예: 재도전 라운드는 SRS 미반영)은 어차피 정책으로 표현할 수 없어 서버 로직이 필요하다.

Echo Flip은 어차피 SRS 계산과 트랜잭션 때문에 Go API가 필수였다.
그렇다면 인가를 Go 핸들러 한 곳으로 모으고(모든 store 쿼리가 `user_id = $1` 조건을 지니는 것을 보았을 것이다), DB 접근 경로를 하나로 줄이는 편이 검증할 표면적을 최소화한다.
"정책을 잘 쓰는 것"과 "정책이 필요 없게 만드는 것" 중 후자를 골랐다.
이 구조에서 Supabase는 인증 제공자 겸 관리형 PostgreSQL로만 쓰이는데, 그 연결 구성은 10장에서 이어서 다룬다.

## 정리

이번 장에서는 Echo Flip의 데이터베이스 설계를 요구사항에서 스키마까지, 스키마에서 쿼리까지 따라가 봤다.

첫째, 관계형 데이터베이스와 PostgreSQL이라는 선택의 근거는 1장에서 정리한 대로다.

둘째, 요구사항의 명사에서 일곱 엔티티를 도출했고, 정합성은 외래 키·cascade·not null·유니크 제약으로 DB에 맡겼다.
기본 키는 노출되는 엔티티에 UUID, 내부 로그에 identity라는 이원 전략을 썼고, 인덱스는 due 큐의 `(user_id, due_at)` 복합 인덱스처럼 store 계층의 실제 조회 패턴에서 역산했다.

셋째, SRS 상태는 알고리즘이 필요로 하는 최소 상태로 컬럼을 구성했고, 복습 기록은 `for update` 행 잠금과 트랜잭션으로 로그 삽입과 상태 갱신을 원자적으로 처리한다.
재도전 라운드를 SRS에서 제외하는 도메인 규칙은 `is_retry` 컬럼 하나로 스키마에 새겨졌다.

넷째, 스키마는 golang-migrate의 버전 있는 up/down 파일로 진화하며, 공유 기능(000002), 양방향 카드(000003), 덱 slug 시퀀스(000004)처럼 요구사항 변화가 곧 마이그레이션 이력이 된다.
덱 slug는 identity 시퀀스를 곱셈 순열로 뒤섞은 Base36 4자 코드로, 짧은 URL과 순번 은닉을 저장 컬럼 추가 없이 얻었다.

다섯째, RLS는 "enable + 정책 0개 + revoke"로 PostgREST 경로를 차단하고 인가를 Go API 한 곳에 모았다.
클라이언트 직접 접근이 주는 편의를 포기하는 대신 검증할 표면적을 최소화한 트레이드오프다.

다음 장부터는 2부로 넘어가, 이 앱의 코드를 만들어 낸 AI 에이전트와 앱이 돌아가는 인프라를 살펴본다.
