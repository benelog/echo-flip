# 14장 로컬 개발 환경: 내 컴퓨터에서 앱 완성하기

2장부터 13장까지 Echo Flip의 코드를 층층이 읽어 왔다.
데이터가 저장되는 테이블에서 출발해 Go API와 React 화면을 지나, 그 코드를 만들어 내는 에이전트의 작업 환경까지 올라왔다.
이번 장은 1부의 피날레다.
지금까지 지면 위에서 읽어 온 코드를 독자의 컴퓨터에서 실제로 돌려 보겠다.

미리 말해 두면 준비물은 Go와 Node.js뿐이고, 데이터베이스 계정을 만들 필요도 환경 변수를 채운 설정 파일을 준비할 필요도 없다.
이 장에서는 먼저 클론에서 실행까지의 최단 경로를 걷고, 이 무설정 실행이 어떻게 가능한지 코드로 해부한다.
이어서 내 학습 데이터가 담긴 파일 하나를 직접 열어 보고, VS Code 설정으로 사람의 작업 환경을 마저 갖춘 뒤, 이 모든 것을 관통하는 환경 변수라는 관점을 정리하며 1부를 맺는다.

## 클론에서 실행까지, 터미널 두 개

준비물은 Go 툴체인과 Node.js 두 가지다.
아직 없다면 각 공식 사이트에서 내려받아 설치하고, `go version`과 `node --version`이 버전을 출력하면 준비가 끝난 것이다(이 책의 코드는 Go 1.26과 Node.js 24에서 확인했다).

저장소를 아직 받지 않았다면 명령 한 줄로 내려받는다.
git이 무엇인지는 15장에서 제대로 다루므로, 지금은 "저장소의 코드 전체를 내 컴퓨터로 복사해 온다" 정도로 이해해도 충분하다.

```bash
git clone https://github.com/benelog/echo-flip.git
cd echo-flip
```

이제 터미널 두 개를 열고, 첫 번째 터미널에서 Go API를 띄운다.

```bash
go run ./cmd/server
```

처음 한 번은 의존성 다운로드와 컴파일 때문에 시간이 조금 걸리고, 기동에 성공하면 로그 한 줄이 나온다.

```
2026/07/11 06:15:20 echo-flip api listening on :8080 (local mode, sqlite: echo-flip.db)
```

`local mode`라는 표시를 눈여겨보자.
아무 설정도 주지 않았으므로 서버가 로컬 모드로 떴고, 데이터는 `echo-flip.db`라는 SQLite 파일에 저장된다는 뜻이다.

두 번째 터미널에서 Next 개발 서버를 띄운다.

```bash
npm install
npm run dev
```

몇 초 뒤 `✓ Ready`와 함께 `http://localhost:3000` 주소가 출력된다.
브라우저로 그 주소를 열면 로그인 화면 없이 곧바로 홈 화면이 나오고, 상단 바 오른쪽, 배포된 앱이라면 계정 이메일이 있을 자리에는 "로컬 모드"라고 적혀 있다.
"기본 영단어"라는 덱을 만들고 resilient와 deliberate 두 카드를 추가해 학습을 시작하면, 도입 장에서 화면 캡처로만 봤던 그 흐름이 내 컴퓨터에서 돈다.
맞음과 틀림을 고를 때마다 3장의 테이블에 복습 기록이 쌓이고, 5장의 SRS 함수가 다음 복습 시각을 계산하고, 7장의 Gin 핸들러와 11장의 TanStack Query가 그 사이를 나른다.
읽기만 하던 코드가 전부 살아 움직이는 순간이다.

여기서 지킨 규약은 하나다.
**환경 변수가 하나도 없으면 로컬 모드다.**
Go API는 `DATABASE_URL`이 없으면, 화면은 `NEXT_PUBLIC_SUPABASE_URL`이 없으면 각자 로컬 모드로 동작한다.
클론 직후의 저장소에는 어느 값도 없으므로 두 프로세스가 자연스럽게 같은 모드에서 만난다.

## 무설정 실행은 어떻게 가능한가

배포된 Echo Flip은 PostgreSQL과 Supabase 인증 위에서 도는데, 방금은 둘 다 없이 돌았다.
공짜 마법이 아니라 코드 곳곳에 준비된 분기 덕분이므로 그 분기를 따라가 보겠다.

출발점은 4장에서 읽었던 `internal/config/config.go`다.
이 코드는 `DATABASE_URL`이 있으면 운영과 같은 PostgreSQL 구성을, 없으면 SQLite 파일과 로컬 인증이라는 기본값을 채운다.

```go
	if cfg.DatabaseURL != "" {
		cfg.Driver = "postgres"
		cfg.AuthMode = "supabase"
		// ...
		return cfg, nil
	}

	if os.Getenv("VERCEL") != "" {
		return nil, fmt.Errorf("DATABASE_URL is required on Vercel")
	}
	cfg.Driver = "sqlite"
	cfg.AuthMode = "local"
	cfg.SQLitePath = os.Getenv("SQLITE_PATH")
	if cfg.SQLitePath == "" {
		cfg.SQLitePath = "echo-flip.db"
	}
	if len(cfg.AllowedOrigins) == 0 {
		cfg.AllowedOrigins = []string{"http://localhost:3000"}
	}
	return cfg, nil
```

로컬 모드의 기본값 세 가지가 여기서 정해진다.
데이터베이스 드라이버는 SQLite(파일은 `echo-flip.db`), 인증 모드는 로컬, CORS 허용 오리진은 `http://localhost:3000`이다.
마지막 값이 왜 필요한지는 7장에서 다뤘다.
화면은 3000번 포트에서, API는 8080번 포트에서 돌므로 브라우저가 보기에 둘은 다른 오리진이고, API가 3000번 오리진을 허용한다고 선언하지 않으면 브라우저가 응답을 막는다.

중간의 `VERCEL` 검사는 이 기본값이 사고로 번지는 것을 막는 가드다.
배포 환경에서 `DATABASE_URL`을 깜빡 빠뜨리면 서버리스 함수의 일회용 파일 시스템에 조용히 SQLite 파일을 만들었다가 데이터를 통째로 잃게 되므로, Vercel 위에서는 로컬 모드로 넘어가는 대신 기동을 거부한다.

인증 쪽 분기는 `internal/auth/local.go`에 있다.
이 코드는 토큰을 검사하는 대신 모든 요청을 고정된 한 명의 사용자로 로그인시킨다.

```go
// LocalUserID is the fixed identity every request runs as in local mode.
var LocalUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// ...
func LocalMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(userIDKey, LocalUserID)
		c.Next()
	}
}
```

7장에서 본 라우터 조립부(`pkg/app/app.go`)는 인증 모드가 로컬이면 JWT 검증 미들웨어 자리에 이 함수를 대신 끼운다.
라우터도, 핸들러도, 그 아래 store 계층도 전부 그대로이고 바뀌는 것은 문 앞의 문지기 하나뿐이다.
로컬 모드라고 다른 앱이 도는 것이 아니라, 배포 환경과 같은 코드가 다른 문지기를 세우고 도는 것이다.

화면 쪽의 분기는 `src/lib/supabase.ts`의 상수 하나다.
이 코드는 Supabase 주소가 없다는 사실 자체를 로컬 모드라는 신호로 삼는다.

```ts
// Local mode: without NEXT_PUBLIC_SUPABASE_URL the app runs sign-in free
// against a local server that ignores auth. Mirrors the Go server's rule.
export const localMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;
```

11장에서 본 `AuthProvider`는 이 값이 참이면 Supabase에 세션을 묻는 대신, `local@localhost`라는 사용자가 항상 로그인해 있는 것처럼 행동하는 스텁(stub) 세션을 Context에 실어 준다.
로그인 화면이 아예 안 나온 이유이고, 상단 바의 `TopBar.tsx`가 "로컬 모드"를 표시하는 근거도 같은 상수다.
API의 주소는 `src/lib/api.ts`가 개발 서버에서 `http://localhost:8080`을 기본값으로 쓰도록 되어 있어 따로 알려 줄 필요가 없다.

## 내 데이터는 파일 하나에 있다

앱을 조금 만져 봤다면 저장소 루트에 `echo-flip.db`가 생겼을 것이다(쓰는 도중에는 `-wal`·`-shm`이 붙은 작업 파일 두 개도 함께 보인다).
이 파일이 데이터베이스 전부다.
1장에서 SQLite를 "파일 하나로 동작하는 관계형 데이터베이스"라고 소개했는데, 그 파일이 바로 이것이고, 세 파일 모두 `.gitignore`에 올라 있어 내 학습 데이터가 저장소에 커밋될 일은 없다.

그런데 테이블을 만드는 명령을 한 번도 실행하지 않았는데도 3장에서 설계한 테이블들이 전부 준비되어 있다.
3장 끝에서 로컬 SQLite의 스키마는 서버가 시작할 때 통째로 적용된다고 했는데, 그 일을 하는 코드가 `internal/litestore/litestore.go`에 있다.
이 코드는 SQLite 파일을 열고(없으면 만들고), 소스에 함께 임베드된 스키마를 곧바로 적용한다.

```go
//go:embed schema.sql
var schemaSQL string

// ...
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite",
		path+"?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(wal)")
	// ...
	if _, err := db.Exec(schemaSQL); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &Store{db: db}, nil
}
```

`internal/litestore/schema.sql`은 3장에서 발췌해 읽었던 바로 그 스키마 파일이다.
모든 문장이 `if not exists` 꼴이라 몇 번을 다시 실행해도 이미 있는 테이블과 인덱스는 건드리지 않으므로, 별도의 명령 없이 서버를 켜기만 하면 스키마가 준비된다.

이 파일을 직접 열어 보자.
sqlite3 명령줄 도구는 macOS에 기본으로 들어 있고, 우분투에서는 `sudo apt install sqlite3`로 설치한다.
서버를 잠시 멈춘 뒤(Ctrl+C) 저장소 루트에서 `sqlite3 echo-flip.db`를 실행한다.

```
sqlite> .tables
card_srs          cards_with_stats  profiles          smart_decks
cards             decks             review_logs       study_sessions
sqlite> select name from decks;
기본 영단어
sqlite> select text, meaning from cards;
resilient|회복력 있는
deliberate|의도적인; 심사숙고하다
```

3장에서 설계한 테이블들이 그대로 있고, 브라우저에서 만든 덱과 카드는 2장에서 배운 그 `select`로 조회된다.
`.tables`는 테이블뿐 아니라 뷰도 보여 주므로 통계 조회용 뷰인 `cards_with_stats`까지 목록에 나온다.
`profiles`에는 사용자가 단 한 명 있는데, 그 id를 조회해 보면 조금 전 `local.go`에서 본 `LocalUserID`와 같은 값이다.
2장에서 배운 SQL을 실험할 놀이터로도 이 파일만 한 것이 없어서, 무엇을 조회하든 내 데이터라 결과를 눈으로 검증할 수 있고, 실수로 망가뜨려도 파일을 지우고 서버를 다시 켜면 빈 상태에서 새로 시작한다.

백업도 단순해서, 서버를 멈춘 상태에서 파일을 복사하면 끝이다.
sqlite3로 한 번 열었다 닫으면 작업 파일의 내용이 본 파일로 합쳐지므로 `echo-flip.db` 하나만 복사해도 된다.
데이터베이스 백업이라는 말의 무게에 비하면 싱거울 정도인데, 운영 데이터베이스의 백업은 21장에서 이보다 무겁게 다시 만난다.

## .vscode: 에디터가 프로젝트의 규칙을 실어 나른다

앱이 돌았으니 이제 코드를 고치는 사람의 환경을 갖출 차례다.
에디터 설정은 보통 개인의 영역이라, 글꼴 크기나 색 테마를 저장소에 강요할 이유는 없다.
그러나 "이 프로젝트의 Go 파일은 저장할 때 gofmt를 돌린다", "타입 검사는 이 명령으로 한다" 같은 규칙은 취향이 아니라 프로젝트의 성질이다.
이런 규칙이 각자의 머릿속에만 있으면 새로 합류한 사람도, AI 에이전트도 알 길이 없다.

VS Code는 작업 폴더의 `.vscode/` 디렉터리를 읽어 개인 설정 위에 덮어쓴다.
프로젝트에 종속된 규칙만 골라 이 디렉터리에 담아 커밋하면, 클론한 사람은 별도 안내 없이 같은 환경을 얻는다.
Echo Flip의 `.vscode/`에는 파일 네 개(extensions.json, settings.json, tasks.json, launch.json)가 들어 있다.

### extensions.json: 필요한 확장을 저장소가 알려 준다

```json
{
  "recommendations": [
    "golang.go",
    "bradlc.vscode-tailwindcss",
    "vitest.explorer",
    "anthropic.claude-code"
  ]
}
```

VS Code는 이 목록을 읽고 "이 저장소가 권장하는 확장이 있습니다"라고 안내한다(강제 설치가 아니라 추천이다).
`golang.go`는 Go 공식 확장으로 뒤에서 볼 포맷·검사·디버깅이 모두 여기에 얹히고, `bradlc.vscode-tailwindcss`는 Tailwind 클래스 이름을 자동 완성한다.
`vitest.explorer`는 9장에서 본 vitest 테스트를 에디터 옆 목록에서 하나씩 실행하게 해 주고, `anthropic.claude-code`는 12장의 Claude Code를 에디터 안에서 띄우는 확장이다.

목록이 짧은 것은 의도한 결과로, Go 쪽은 gofmt가 포맷을 독점하고 TypeScript 쪽은 `tsc`의 strict 모드가 검증을 맡는 구성이라, ESLint나 Prettier 같은 포매터와 린터를 따로 들일 이유가 없었다.

### settings.json: 저장하는 순간 규칙이 적용된다

```json
{
  "editor.formatOnSave": true,

  "[go]": {
    "editor.defaultFormatter": "golang.go",
    "editor.codeActionsOnSave": {
      "source.organizeImports": "explicit"
    }
  },
  "go.useLanguageServer": true,
  "go.formatTool": "gofmt",
  "go.vetOnSave": "package",
  // ...
  "typescript.tsdk": "node_modules/typescript/lib",
  // ...
  "files.trimTrailingWhitespace": true
}
```

`editor.formatOnSave`가 켜져 있고 `[go]` 블록이 포매터를 Go 확장으로 지정하므로, Go 파일을 저장하는 순간 gofmt가 돌아 6장에서 본 세로 정렬이 자동으로 맞춰진다.
`source.organizeImports`는 저장할 때 쓰지 않는 import를 지우고 남은 것을 표준 순서로 정렬한다.
Go는 쓰지 않는 import를 컴파일 에러로 처리하므로, 이 한 줄이 "빌드는 되는데 import만 어긋난" 상태를 아예 만들지 않는다.
`go.vetOnSave`를 `package`로 두면 저장할 때마다 그 파일이 속한 패키지에 `go vet`이 돌아, 6장에서 본 정적 분석이 편집 중에 밑줄로 나타난다.

::: info [용어 풀이] 언어 서버(Language Server)
에디터와 따로 떨어져 돌면서 코드를 읽고 이해해 주는 배후 프로그램이다.
자동 완성, 정의로 이동, 오류 표시 같은 기능을 에디터가 직접 구현하는 대신 이 서버에 물어보는 구조라, 언어 하나에 서버 하나만 만들어 두면 여러 에디터가 함께 쓸 수 있다.
Go의 언어 서버는 gopls이고, `go.useLanguageServer`가 이를 켜는 설정이다.
:::

TypeScript 쪽에서 눈여겨볼 것은 `typescript.tsdk`다.
VS Code에는 자체 TypeScript가 딸려 오는데, 그 버전이 프로젝트의 `node_modules`에 설치된 버전과 다르면 에디터가 표시하는 오류와 `tsc` 명령이 내는 오류가 어긋난다.
이 설정은 에디터가 프로젝트에 설치된 TypeScript를 쓰게 만들어 둘을 일치시킨다.

### tasks.json: 검증 명령에 이름을 붙인다

6장의 `go build`·`go vet`·`go test`, 9장의 `tsc`와 vitest는 모두 터미널에서 치면 되는 명령이다.
그래도 tasks로 등록하면 명령을 외우지 않아도 되고, VS Code가 출력에서 파일과 줄 번호를 뽑아 문제 목록으로 만들어 준다.

```json
{
  "version": "2.0.0",
  "tasks": [
    { "label": "go: build", "type": "shell", "command": "go build ./...",
      "group": "build", "problemMatcher": ["$go"] },
    { "label": "go: test", "type": "shell", "command": "go test ./...",
      "group": "test", "problemMatcher": ["$go"] },
    { "label": "go: vet", "type": "shell", "command": "go vet ./...",
      "problemMatcher": ["$go"] },
    { "label": "ts: typecheck", "type": "shell", "command": "npx tsc --noEmit",
      "group": "build", "problemMatcher": ["$tsc"] },
    { "label": "web: test", "type": "shell", "command": "npm test",
      "group": "test" },
    {
      "label": "전체 검증",
      "dependsOn": ["go: build", "go: vet", "go: test", "ts: typecheck", "web: test"],
      "dependsOrder": "sequence",
      "group": { "kind": "test", "isDefault": true },
      "problemMatcher": []
    }
  ]
}
```

`problemMatcher`의 `$go`와 `$tsc`는 VS Code에 내장된 출력 해석 규칙이다.
`go vet`이 `internal/store/deckslug.go:42:5: ...` 같은 줄을 뱉으면, 이 규칙이 파일 경로와 위치를 알아채 문제 목록에 클릭 가능한 항목으로 올린다.

마지막 `전체 검증` 태스크는 앞의 다섯을 순서대로 묶고, `dependsOrder`가 `sequence`이므로 하나라도 실패하면 거기서 멈춘다.
커밋 전에 이 태스크 하나만 돌리면 Go와 프런트엔드 양쪽의 기계적 검증이 한 번에 끝난다.

### launch.json: 두 프로세스를 한 번에 띄운다

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Go API (cmd/server)",
      "type": "go",
      "request": "launch",
      "mode": "debug",
      "program": "${workspaceFolder}/cmd/server"
    },
    // ...
    {
      "name": "Next dev",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev",
      // ...
    }
  ],
  "compounds": [
    {
      "name": "풀스택 (Go API + Next dev)",
      "configurations": ["Go API (cmd/server)", "Next dev"],
      "stopAll": true
    }
  ]
}
```

첫 구성에 환경 변수 항목이 없다는 것부터 짚어 두자.
로컬 모드 덕분에 디버거로 띄우는 Go API도 아무 값 없이 그냥 뜨므로, 클론 직후의 저장소에서 F5 한 번으로 중단점까지 걸 수 있다.

`compounds`는 여러 구성을 한 번에 띄우는 장치다.
`풀스택`을 실행하면 Go API와 Next dev가 함께 뜨고, `stopAll`이 켜져 있어 한쪽을 멈추면 다른 쪽도 함께 내려간다.
5장에서 읽은 `srs.Grade`에 중단점을 걸고 카드 하나를 "맞음"으로 넘겨 보면, 글로만 따라가던 간격 계산이 값을 바꿔 가며 눈앞에서 진행된다.

Go 디버깅에는 델브(Delve)가 필요한데, `dlv` 실행 파일이 없으면 Go 확장이 설치하겠느냐고 물으므로 따로 챙길 것은 없다.

## 사람의 입구와 에이전트의 입구

여기까지 읽었다면 기시감이 들 것이다.
저장할 때 gofmt를 돌리고 `go vet`을 확인하는 일은, 13장에서 본 훅이 에이전트에게 하는 일과 정확히 같다.
차이는 대상이다.
사람이 에디터에서 파일을 저장하면 `settings.json`의 `formatOnSave`가 gofmt를 돌리고, 에이전트가 도구로 파일을 쓰면 `.claude/hooks/go-check.sh`가 gofmt를 돌린다.
같은 규칙이 두 개의 입구에 각각 걸려 있다.

이것이 우연이 아니라는 데 이 절의 요점이 있다.
사람과 에이전트가 같은 저장소를 고치는데 포맷 규칙이 서로 다르면, 두 쪽이 번갈아 파일을 건드릴 때마다 의미 없는 diff가 쌓인다.
규칙을 저장소에 한 번 적어 두고 양쪽 입구에 똑같이 걸어 두면 누가 고쳤든 결과물의 모양이 같다.
설정 옵션이 없는 `gofmt`를 쓰는 이점이 여기서 한 번 더 나타나는데, 사람의 에디터와 에이전트의 훅이 같은 결과에 도달한다는 것을 따로 맞춰 볼 필요가 없다.

Claude Code도 두 입구를 오간다.
12장에서 본 CLI를 터미널에서 그대로 써도 되고 `anthropic.claude-code` 확장으로 에디터 안에서 띄워도 되는데, 확장을 쓰면 에이전트의 변경 사항이 에디터의 diff 뷰로 열려 좌우를 나란히 놓고 볼 수 있다.
어느 쪽이든 품질을 지키는 장치는 저장소에 적힌 규칙이다.

## 환경 변수라는 손잡이

이 장에서 "환경 변수가 없으면"이라는 말을 여러 번 썼으니 개념을 정리하고 가자.
환경 변수(Environment Variable)는 프로그램이 실행될 때 운영체제로부터 건네받는 이름표 붙은 값으로, 코드를 고치지 않고 프로그램의 동작을 바깥에서 바꾸는 손잡이다.
로컬 모드는 이 관점에서 다시 읽을 수 있는데, "손잡이를 하나도 잡지 않았을 때의 기본 동작"을 신중하게 설계해 둔 결과가 로컬 모드다.

몇 개는 지금 당장 돌려 볼 수 있어서, `SQLITE_PATH=~/cards/my.db go run ./cmd/server`처럼 실행하면 데이터 파일의 위치가 바뀌고, `PORT`는 API의 포트를 바꾼다.
포트를 바꿀 때는 `api.ts`의 기본값이 8080번을 가리키므로 화면 쪽에도 `NEXT_PUBLIC_API_URL`로 새 주소를 알려 줘야 한다.

그리고 가장 큰 손잡이가 남아 있다.
`DATABASE_URL`을 채우는 순간 서버는 SQLite를 접고 진짜 PostgreSQL에 연결하며, `NEXT_PUBLIC_SUPABASE_URL`을 채우는 순간 화면에 로그인이 생긴다.
그 값들을 어디서 얻고, 매번 타이핑하지 않으려면 어떤 도구(direnv)를 쓰는지는 운영 데이터베이스를 연결하는 19장에서 다룬다.

## 이 구성이 내주는 것

무설정 실행과 커밋된 에디터 설정에도 대가가 있다.

첫째, 로컬 모드는 운영과 다른 데이터베이스 엔진 위에서 돈다.
`internal/litestore`는 `internal/store`와 같은 인터페이스를 SQLite 방언으로 다시 구현한 것이라 같은 기능을 두 벌 유지하는 비용이 들고, PostgreSQL에만 있는 기능(19장에서 다룰 RLS와 태그 검색용 GIN 인덱스)은 로컬 모드에 없으므로 로컬에서 통과했다고 운영에서도 똑같이 동작한다는 보장은 아니다.
그 대가로 계정도 네트워크도 없는 실행을 얻었고, 남는 간극은 19장에서 개발용 PostgreSQL을 연결해 메운다.

둘째, `.vscode/`는 VS Code에 맞춘 설정이라 다른 에디터를 쓰는 사람에게는 도움이 되지 않는다.
Neovim이나 JetBrains GoLand를 쓰는 사람은 같은 규칙을 자기 환경에 손으로 옮겨야 한다.
이 위험을 줄이는 방법은 규칙의 원본을 에디터 바깥에 두는 것이다.
Echo Flip에서 포맷의 원본은 `gofmt`이고 검증의 원본은 `go vet`과 `tsc`이며, `.vscode/`는 그 명령들을 편하게 부르는 껍데기라 에디터를 바꿔도 따라오지 못할 규칙이 없다.

셋째, `settings.json`에 개인 취향을 섞기 시작하면 금세 다툼거리가 된다.
글꼴, 색 테마, 탭 표시 폭처럼 커밋되는 파일의 내용을 바꾸지 않는 항목은 개인 설정에 두고, 저장소에는 파일 내용을 바꾸는 규칙만 남기는 것이 경계선이다.
`files.trimTrailingWhitespace`가 저장소에 들어간 이유도 그것이 취향이 아니라 커밋 내용을 바꾸는 규칙이기 때문이다.

## 정리

첫째, Echo Flip은 Go와 Node.js만 있으면 터미널 두 개로 완성된다.
`go run ./cmd/server`와 `npm run dev`를 띄우면, 환경 변수가 하나도 없으면 로컬 모드라는 규약 덕분에 로그인 없이 바로 덱을 만들고 학습할 수 있다.

둘째, 무설정 실행은 코드에 준비된 분기가 만든다.
`config.go`가 `DATABASE_URL`의 부재를 보고 SQLite 드라이버와 로컬 인증과 CORS 기본값을 채우고, `LocalMiddleware`가 고정 사용자를 세우고, 화면은 `NEXT_PUBLIC_SUPABASE_URL`의 부재를 같은 신호로 읽는다.
바뀌는 것은 문지기와 저장소이고, 라우터·핸들러·화면은 배포 환경과 같은 코드다.

셋째, 내 데이터는 `echo-flip.db` 파일 하나에 있다.
스키마는 서버가 시작할 때 자동 적용되므로 마이그레이션 명령이 필요 없고, sqlite3로 열면 3장의 테이블을 그대로 볼 수 있으며, 백업은 파일 복사다.

넷째, `.vscode/` 네 파일은 포맷과 검증 명령, 디버깅 구성을 저장소가 실어 나르게 한다.
`전체 검증` 태스크 하나가 Go와 프런트엔드의 검사를 순서대로 묶고, `compounds`가 두 프로세스를 F5 한 번에 띄운다.
에디터의 저장 시 포맷과 13장의 훅은 같은 규칙을 사람 쪽 입구와 에이전트 쪽 입구에 각각 걸어 둔 구성이다.

다섯째, 로컬 모드는 환경 변수가 없을 때의 기본값으로 설계됐다.
`SQLITE_PATH`와 `PORT` 같은 손잡이는 지금도 쓸 수 있고, `DATABASE_URL`이라는 가장 큰 손잡이는 19장에서 잡는다.

이것으로 1부가 끝났다.
데이터의 모양을 정하고(2·3장), 그것을 다루는 서버를 읽고(4~7장), 화면을 붙이고(8~11장), 코드를 만들어 내는 에이전트와 사람의 환경을 갖췄으며(12~14장), 그 전부가 방금 독자의 컴퓨터에서 돌았다.

그런데 이 앱은 아직 내 컴퓨터에만 있어서, 주소를 아는 사람도 접속할 방법도 없다.
2부에서는 이 앱을 세상에 공개하고 월 0원으로 운영하는 길을 걷는다.
그 첫걸음은 배포 버튼이 아니라 코드의 이력을 관리하는 규율, 곧 15장의 Git이다.
