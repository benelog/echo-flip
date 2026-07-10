# 18장 Supabase 데이터베이스 연결: pgx와 트랜잭션 풀러

17장에서 인증을 마쳤다.
브라우저가 토큰을 얻고 Go API가 그 서명을 검증하는 데까지가 거기였고, 검증을 통과한 요청은 이제 데이터베이스로 내려간다.

이 장은 그 내려가는 길을 다룬다.
Go가 PostgreSQL과 대화하는 드라이버를 고르는 문제에서 시작해, 함수 인스턴스가 여럿 뜨는 서버리스 환경에서 커넥션이 폭증하는 문제와 그 해법인 트랜잭션 풀러, 풀러를 쓰는 대가로 pgx에 붙여야 하는 설정, 그리고 마이그레이션만은 직접 연결로 붙어야 하는 이유를 차례로 짚는다.
마지막으로 함수와 데이터베이스를 같은 리전에 두는 콜로케이션, 3장에서 본 RLS 전략이 인증 구조와 만나는 접점, 배포 환경의 환경 변수 구성을 정리한다.

여기서 나오는 포트 번호 두 개(6543과 5432)는 14장에서 `.envrc`를 쓸 때 이미 만났다.
왜 그렇게 갈라져 있는지가 이 장에서 밝혀진다.

## DB 연결: 서버리스와 커넥션 풀

인증 다음은 데이터베이스 연결이다.
겉보기에는 연결 문자열 하나 넘기는 단순한 일이지만, 서버리스 환경에서는 이 장에서 가장 함정이 많은 주제다.

### pgx를 고른 이유

`go.mod`에서 DB 관련 의존성을 확인하자.

```go
require (
	// ...
	github.com/golang-migrate/migrate/v4 v4.19.1
	github.com/jackc/pgx/v5 v5.10.0
)
```

Go에서 PostgreSQL에 접속하는 정석은 표준 `database/sql` 인터페이스에 드라이버를 꽂는 방식이고, 오랫동안 `lib/pq`가 그 자리를 지켰다.
그러나 `lib/pq`는 유지보수 모드로 전환되었고, 프로젝트 스스로 pgx로 갈아탈 것을 권한다.

pgx는 PostgreSQL 전용 드라이버로, 표준 인터페이스를 거치지 않는 자체 API를 제공한다.
Postgres의 타입과 프로토콜을 직접 다루므로 성능이 좋고, 커넥션 풀(`pgxpool`)이 내장되어 있으며, 무엇보다 쿼리 실행 모드를 세밀하게 제어할 수 있다.
마지막 특성이 잠시 뒤 결정적으로 중요해진다.

`database/sql` 인터페이스가 나은 경우도 분명히 있다.
DB 종류를 바꿀 가능성이 있거나 `sqlx` 같은 표준 인터페이스 기반 생태계를 활용하고 싶다면 그쪽이 맞다.
Echo Flip은 PostgreSQL 고정이므로 추상화 계층을 걷어내고 pgx 네이티브 API를 쓴다.

### 서버리스에서 커넥션이 폭증하는 문제

상주 서버에서는 프로세스가 하나, 풀이 하나이므로 풀 크기가 곧 커넥션 상한이다.
서버리스는 다르다.
동시 요청이 늘면 플랫폼이 함수 인스턴스를 여러 개 띄우고 인스턴스마다 자기만의 풀을 만들기 때문에, 총 커넥션 수는 "인스턴스 수 × 풀 크기"가 되고 인스턴스 수는 우리가 통제할 수 없는 변수다.

한편 PostgreSQL의 커넥션은 값비싼 자원이다.
연결마다 서버 쪽 프로세스가 하나씩 붙어 메모리를 소비하므로, 무료 티어의 작은 인스턴스가 감당하는 직접 연결은 수십 개 수준에 불과하다.
트래픽이 몰려 인스턴스가 불어나면 `max_connections`가 소진되고, DB는 멀쩡한데 연결이 안 되는 장애가 난다.

### 트랜잭션 풀러와 simple protocol

이 문제의 표준 해법이 연결 풀러(connection pooler)다.
Supabase는 Supavisor라는 풀러를 함께 제공한다.
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
연결을 빌려 쓰고 곧바로 반납하는 구조라서, 앞서 빌린 연결에 미리 준비해 둔 것이 다음에 빌리는 연결에는 남아 있지 않기 때문이다.
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
// Pool returns a process-wide pgx pool. On Vercel each warm function instance
// reuses it across invocations, so keep it small: Supabase's pooled port
// (Supavisor transaction mode) also rules out prepared statements, hence
// simple protocol.
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
첫째, `sync.Once`로 풀을 프로세스당 하나만 만들어 웜 인스턴스가 호출 간에 재사용한다.
JWKS 클라이언트와 같은 패턴이다.
둘째, `MaxConns = 4`로 풀을 작게 잡아 인스턴스가 늘어도 폭증의 기울기를 낮춘다.
셋째, `QueryExecModeSimpleProtocol`로 단순 프로토콜(simple protocol)을 강제해, 쿼리를 준비 단계 없이 한 번에 보내므로 트랜잭션 풀러에서도 안전하다.

단순 프로토콜에서 파라미터는 pgx가 안전하게 이스케이프한 텍스트로 쿼리에 인코딩되므로 SQL 주입 걱정은 없다.
대신 확장 프로토콜의 바이너리 인코딩과 구문 재사용 이점을 포기하는 것인데, 이 앱의 쿼리 규모에서는 측정조차 어려운 차이다.
풀러와의 호환성을 성능 미세 손실과 맞바꾼, 남는 장사다.

### 마이그레이션은 direct 연결로

그런데 3장에서 다룬 스키마 마이그레이션은 반대로 풀러를 거치면 안 된다.
`internal/db/migrate.go`의 주석이 이유를 밝힌다.

```go
// Migrate applies all pending migrations. It needs a direct (non transaction-
// pooled) connection because golang-migrate takes an advisory lock.
func Migrate(databaseURL string) error {
	// ...
}
```

golang-migrate는 여러 프로세스가 동시에 마이그레이션을 실행하는 사고를 막으려고 권고 잠금(advisory lock)을 잡는다.
권고 잠금은 세션에 묶이는 상태라서, 트랜잭션마다 커넥션이 바뀌는 트랜잭션 풀러에서는 잠금을 잡은 커넥션과 이후 작업 커넥션이 어긋나 오동작한다.
그래서 `cmd/migrate/main.go`는 별도의 연결 문자열을 우선 사용한다.

```go
func main() {
	url := os.Getenv("MIGRATE_DATABASE_URL")
	if url == "" {
		url = os.Getenv("DATABASE_URL")
	}
	// ...
}
```

`MIGRATE_DATABASE_URL`에는 직접 연결(포트 5432) 문자열을 넣는다.
마이그레이션은 배포할 때 한 번, 커넥션 하나로 끝나는 작업이라 직접 연결의 커넥션 부담이 문제되지 않는다.
정리하면 수시로 열리는 API 쿼리는 트랜잭션 풀러(6543), 가끔 실행되는 세션 상태 의존 작업은 직접 연결(5432)로 용도에 따라 포트가 갈린다.

## 리전 콜로케이션: 함수와 DB를 같은 곳에

16장에서 본 `vercel.json`은 함수 리전을 고정하고 있다.

```json
{
  "regions": ["iad1"]
}
```

그리고 DEPLOY.md의 첫 단계는 Supabase 프로젝트를 만들 때 리전을 East US(North Virginia)로 선택하라고 지시하며, "서울 리전을 고르면 안 됩니다"라고 못박는다.
한국 사용자를 위한 앱인데 왜 서울이 아닐까.

핵심은 왕복 횟수의 비대칭이다.
사용자와 함수 사이는 요청당 한 번 왕복하지만, 함수와 DB 사이는 요청 하나를 처리하며 여러 번 왕복한다.
프로필 확인, 덱 조회, 카드 목록, 학습 기록 갱신처럼 쿼리가 이어지면 API 요청 하나에 DB 왕복이 서너 번은 보통이다.

서울과 버지니아 사이의 왕복 지연(round-trip latency)은 약 180ms다.
함수가 iad1에 있는데 DB가 서울이라면, DB 왕복 4번에 지연만 700ms가 넘게 쌓인다.
반대로 함수와 DB가 같은 리전이면 왕복당 1ms 수준이라 쿼리 횟수가 체감 지연에서 사실상 사라진다.
Vercel 무료 티어의 함수 리전 선택지가 제한적이어서 함수를 서울로 옮기는 길이 막혀 있으니, DB를 함수 곁으로 보내는 것이 남은 최선이다.

물론 사용자→함수 구간의 태평양 횡단 180ms는 남지만, 요청당 한 번뿐인 비용이고 정적 자산은 CDN 엣지가 사용자 가까이에서 응답하므로 첫 화면 로딩은 리전과 무관하게 빠르다.
쓰는 플랫폼이 서울 리전 함수를 지원한다면 함수와 DB를 모두 서울에 두는 것이 정답이다.
콜로케이션(colocation)의 원칙은 "함수를 어디에 두든, DB는 반드시 그 옆에"이다.

::: info [용어 풀이] 콜로케이션(Colocation)
서로 자주 대화하는 두 시스템을, 여기서는 함수와 DB를 같은 지역(리전)에 두어 물리적 거리를 좁히는 것이다.
하루에도 수십 번 오가는 두 부서를 같은 층에 배치하는 것과 같아서, 오갈 때마다 드는 시간이 쌓이지 않는다.
멀리 떨어져 있으면 왕복 지연이 요청마다 누적되므로, 대화가 잦을수록 같이 두는 이득이 크다.
:::

## RLS 전략 복기: 인증 구조와의 접점

3장에서 설계한 RLS 전략이 17장의 인증 구조와 어떻게 맞물리는지만 짧게 복기한다.

Supabase에는 우리가 만든 Go API를 거치지 않고도 브라우저가 테이블에 직접 손을 댈 수 있는 통로가 기본으로 열려 있다.
anon key만 있으면 PostgREST 자동 API로 테이블에 접근할 수 있는 구조인데, anon key는 프런트엔드 번들에 들어가는 공개 값이라 그대로 두면 Go API의 인증·인가 로직을 우회하는 뒷문이 열린다.
Echo Flip은 모든 테이블에 RLS를 켜되 정책을 하나도 만들지 않았다.
RLS가 켜진 테이블에서 정책이 없으면 모든 행 접근이 거부되므로, anon key로는 어떤 데이터도 읽거나 쓸 수 없다.

반면 Go API는 `DATABASE_URL`의 postgres 역할로 접속하고, 이 역할은 테이블 소유자라서 RLS의 적용을 받지 않는다.
결과적으로 데이터 접근 경로는 Go API 하나로 수렴하고, 누가 무엇을 볼 수 있는지는 전부 Go 코드의 `WHERE user_id = ...` 조건이 결정한다.
RLS를 접근 제어 규칙이 아니라 뒷문을 잠그는 자물쇠로 쓴 셈이다.

## 환경 변수 구성

마지막으로 이 모든 연결을 묶는 설정을 정리한다.
저장소 루트의 `.env.local.example`이 전체 목록이다.

```bash
# 웹 (Next.js) — .env.local로 복사해서 값 채우기
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# 로컬 개발: Go API 주소. 프로덕션(Vercel)에서는 빈 값(같은 오리진).
NEXT_PUBLIC_API_URL=http://localhost:8080

# Go API (셸에서 export 하거나 direnv 사용) — Vercel 환경변수에도 동일하게 등록
# DATABASE_URL: Supabase → Connect → Transaction pooler (port 6543) 연결 문자열
DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
# 로컬 개발에서만 필요 (Next dev 서버 → Go API CORS)
ALLOWED_ORIGINS=http://localhost:3000

# 마이그레이션 전용: Direct connection (port 5432) 또는 Session pooler 문자열
MIGRATE_DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### 프런트엔드: NEXT_PUBLIC_ 접두사의 의미

Next.js에서 `NEXT_PUBLIC_` 접두사가 붙은 변수는 빌드 시점에 자바스크립트 번들 안에 문자열로 새겨진다.
즉 브라우저를 여는 누구나 볼 수 있는 공개 값이므로, 이 접두사 뒤에는 비밀을 절대 두면 안 된다.

anon key가 여기 있어도 괜찮은 이유는 두 겹이다.
첫째, Supabase 설계상 anon key는 공개를 전제한 식별자로, 인증 요청이 어느 프로젝트 것인지 구분하는 용도다.
둘째, 앞 절의 RLS 전략 덕분에 이 키로는 어차피 데이터에 접근할 수 없다.

`NEXT_PUBLIC_API_URL`은 로컬 개발에서만 값을 채운다.
프로덕션에서는 정적 페이지와 Go 함수가 같은 오리진에서 서비스되므로 빈 값으로 두고 상대 경로 `/api/...`를 호출한다.

### Go API: DATABASE_URL과 SUPABASE_JWKS_URL

Go 쪽 설정은 `internal/config/config.go`가 읽고 검증한다.

```go
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWKSURL:     os.Getenv("SUPABASE_JWKS_URL"),
		JWTSecret:   os.Getenv("SUPABASE_JWT_SECRET"),
		Port:        os.Getenv("PORT"),
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWKSURL == "" && cfg.JWTSecret == "" {
		return nil, fmt.Errorf("SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET is required")
	}
	// ...
```

필수 값이 빠졌으면 서버가 뜨는 시점에 즉시 실패해, 설정 오류를 첫 요청의 알 수 없는 500 오류가 아니라 명확한 메시지로 드러낸다.
JWKS URL과 JWT 시크릿 중 하나만 있으면 되는 조건은 17장에서 본 HS256 폴백과 짝을 이룬다.

각 변수의 성격을 구분해 두자.
`DATABASE_URL`은 DB 비밀번호가 포함된 진짜 비밀로, 유출되면 데이터 전체가 넘어간다.
`NEXT_PUBLIC_` 접두사가 붙지 않았으므로 번들에 새겨지지 않고 서버 측(Vercel 함수 환경 변수)에만 존재한다.
`SUPABASE_JWKS_URL`은 공개키 주소라 비밀은 아니지만 프로젝트마다 달라서 설정으로 뺐다.
`ALLOWED_ORIGINS`는 로컬 개발 전용이다.
로컬에서는 Next 개발 서버(3000)와 Go 서버(8080)의 오리진이 달라 CORS 허용이 필요하지만, 프로덕션은 같은 오리진이라 이 변수 자체가 필요 없다.

### 시크릿 관리 주의점

시크릿이 저장소에 새는 사고를 막는 첫 방어선은 `.gitignore`다.

```txt
# env files (can opt-in for committing if needed)
.env*
!.env.local.example
```

`.env`로 시작하는 모든 파일을 무시하되 자리표시자만 담긴 예제 파일만 예외로 커밋한다.
예제 파일에는 `<password>`처럼 형태만 보여 주는 값을 두고, 실제 값은 로컬의 `.env.local`과 Vercel 대시보드의 환경 변수에만 존재하게 한다.

몇 가지 습관을 덧붙인다.
첫째, 새 변수를 추가할 때 예제 파일에도 반영해 두면 예제 파일이 곧 설정 문서가 된다.
둘째, 유출이 의심되면 즉시 회전한다.
Supabase 대시보드에서 DB 비밀번호를 재설정하면 기존 연결 문자열은 무효가 된다.
셋째, 로컬과 프로덕션의 값 차이를 기록해 둔다.
이 저장소에서는 `.env.local.example`의 주석과 DEPLOY.md의 표가 그 역할을 한다.

## 정리

첫째, Go의 PostgreSQL 드라이버로 pgx를 골랐다.
`database/sql` 위의 범용 인터페이스 대신 네이티브 인터페이스를 쓰면 PostgreSQL 고유 타입과 기능을 그대로 다룰 수 있다.

둘째, 서버리스에서는 함수 인스턴스가 여럿 뜨면서 데이터베이스 커넥션이 폭증한다.
트랜잭션 풀러(6543)를 거치면 문제가 풀리지만, 그 대가로 pgx에 simple protocol을 설정해야 한다.
풀러가 커넥션을 문장 단위로 재사용하므로 세션에 매인 프리페어드 스테이트먼트가 성립하지 않기 때문이다.

셋째, 마이그레이션만은 직접 연결(5432)로 붙는다.
권고 잠금이 세션에 묶여 있어서 트랜잭션 풀러를 거치면 잠금이 유지되지 않는다.
`cmd/migrate`가 `MIGRATE_DATABASE_URL`을 따로 읽는 이유가 이것이다.

넷째, 함수와 데이터베이스를 같은 리전에 둔다.
요청 하나가 여러 번 왕복하는 API에서 리전 간 지연은 그대로 응답 시간에 누적되므로, `vercel.json`이 함수 리전을 데이터베이스 리전에 맞춰 고정한다.

다섯째, RLS는 "enable + 정책 0개 + revoke"로 PostgREST 경로를 막고 인가를 Go API 한 곳에 모은다.
17장에서 본 무상태 인증과 이 결정이 맞물려, 검증할 표면적이 API 한 곳으로 줄어든다.

이것으로 Echo Flip을 이루는 기술과 인프라를 모두 훑었다.
다음 19장부터는 다 만든 앱을 사용자에게 전달하고 오래 운영하는 이야기로 넘어간다.
먼저 브라우저의 웹 앱이 홈 화면에 설치되는 앱이 되는 과정을 살펴본다.
