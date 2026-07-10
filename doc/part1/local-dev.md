# 14장 로컬 개발 환경: direnv와 VS Code

12장과 13장에서 에이전트가 일하는 환경을 갖췄다.
이번에는 사람이 일하는 환경 차례다.

이 장의 목표는 하나다.
저장소를 방금 클론한 사람이 앱을 눈앞에 띄우고, 중단점을 걸어 값을 들여다보고, 커밋 전에 모든 검증을 한 번에 돌릴 수 있게 만드는 것이다.
그 길에는 환경 변수라는 첫 관문이 있고, 그 뒤로 에디터 설정과 디버깅 구성이 이어진다.
마지막에는 여기서 갖춘 로컬 환경이 13장의 훅과 어떻게 같은 규칙을 공유하는지 짚는다.

## 클론에서 실행까지, 전체 지도

Echo Flip을 로컬에서 온전히 돌리려면 프로세스가 두 개 필요하다.

```bash
go run ./cmd/server   # Go API,  http://localhost:8080
npm run dev           # Next 개발 서버, http://localhost:3000
```

브라우저는 3000번 포트의 화면을 열고, 그 화면이 데이터를 필요로 할 때마다 8080번 포트의 Go API를 부른다.
7장에서 본 Gin 엔진이 8080 쪽에서 돌아가고, 11장에서 본 TanStack Query가 3000 쪽에서 그 API를 호출한다.
배포된 환경에서는 이 둘이 같은 주소를 쓰지만(16장), 로컬에서는 포트가 갈리므로 오리진이 달라진다.
그래서 Go API에 `ALLOWED_ORIGINS=http://localhost:3000`을 알려 줘야 브라우저가 요청을 막지 않는다.
7장에서 다룬 CORS가 로컬 개발에서 처음 실물로 등장하는 대목이다.

두 프로세스보다 앞서는 것이 데이터베이스다.
Supabase 프로젝트를 만든 뒤 마이그레이션을 한 번 적용해야 테이블이 생긴다.

```bash
MIGRATE_DATABASE_URL='<direct 연결 문자열>' go run ./cmd/migrate
```

`cmd/migrate/main.go`는 `internal/db`에 임베드된 SQL 마이그레이션을 순서대로 적용하는 40줄짜리 프로그램이다.
연결 문자열이 `DATABASE_URL`과 따로인 이유가 있다.
평소 API는 트랜잭션 풀러(6543 포트)를 거치지만, 스키마를 바꾸는 마이그레이션은 직접 연결(5432 포트)로 붙어야 한다.
왜 그런지는 18장에서 자문 잠금(advisory lock)과 함께 자세히 다룬다.

정리하면 준비물은 Go 툴체인, Node.js, Supabase 프로젝트 하나, 그리고 이들을 이어 줄 환경 변수다.
마지막 항목이 가장 자주 발목을 잡는다.

## 환경 변수: 두 갈래로 흐른다

Echo Flip의 환경 변수는 프런트엔드와 백엔드가 서로 다른 방식으로 읽는다.

::: info [용어 풀이] 환경 변수(Environment Variable)
프로그램이 실행될 때 운영체제로부터 건네받는 이름표 붙은 값이다.
접속 주소나 비밀번호처럼 환경마다 달라지는 값을 코드에 직접 적지 않고 바깥에서 주입하려고 쓴다.
같은 코드가 내 노트북에서는 로컬 데이터베이스를, 배포된 서버에서는 운영 데이터베이스를 바라보게 만드는 장치다.
:::

Next.js는 프로젝트 루트의 `.env.local` 파일을 스스로 읽는다.
그중 `NEXT_PUBLIC_` 접두사가 붙은 값만 브라우저로 내려가는 번들에 포함된다.
접두사가 곧 "이 값은 공개돼도 된다"는 선언이므로, 여기에 비밀을 담으면 그대로 세상에 공개된다.

```bash
# .env.local (커밋하지 않는다)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_API_URL=http://localhost:8080
```

`NEXT_PUBLIC_API_URL`이 로컬에서만 값을 갖는다는 점을 눈여겨보자.
배포 환경에서는 화면과 API가 같은 오리진에 있으므로 이 값을 비워 두고 상대 경로로 요청한다.

반면 Go는 `.env` 파일을 읽지 않는다.
`internal/config/config.go`는 `os.Getenv`로 셸의 환경 변수를 그대로 가져올 뿐이다.
godotenv 같은 라이브러리를 넣지 않은 것은 의도적인 선택이다.
배포 환경인 Vercel은 대시보드에 등록한 값을 프로세스 환경 변수로 주입하므로, 파일을 읽는 코드는 로컬에만 필요한 군더더기가 된다.
로컬과 배포가 같은 경로로 설정을 받는 편이 "로컬에서는 되는데 배포하면 안 되는" 부류의 사고를 줄인다.

그래서 Go API를 띄우려면 셸에 값이 올라와 있어야 한다.

```bash
DATABASE_URL='...' SUPABASE_JWKS_URL='...' ALLOWED_ORIGINS=http://localhost:3000 \
  go run ./cmd/server
```

명령 하나를 돌릴 때는 견딜 만하다.
그런데 서버를 껐다 켤 때마다, 마이그레이션을 돌릴 때마다, 새 터미널 탭을 열 때마다 이 줄을 다시 붙여야 한다면 이야기가 달라진다.

## direnv: 디렉터리에 들어가면 환경이 따라온다

direnv는 이 반복을 없애는 작은 도구다.
디렉터리에 `.envrc` 파일을 두면, 셸이 그 디렉터리로 들어가는 순간 파일에 적힌 변수를 자동으로 export하고 벗어나면 되돌린다.

설치는 패키지 관리자로 하고, 셸 설정에 한 줄을 넣어 훅을 건다.

```bash
# macOS
brew install direnv
# Debian·Ubuntu
sudo apt install direnv

# ~/.bashrc 또는 ~/.zshrc 맨 아래
eval "$(direnv hook bash)"   # zsh를 쓰면 bash 자리에 zsh
```

그다음 저장소 루트에 `.envrc`를 만든다.

```bash
export DB_PW='<supabase 데이터베이스 비밀번호>'
export DATABASE_URL="postgresql://postgres.<project-ref>:${DB_PW}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
export MIGRATE_DATABASE_URL="postgresql://postgres.<project-ref>:${DB_PW}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
export SUPABASE_JWKS_URL='https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json'
export ALLOWED_ORIGINS='http://localhost:3000'
```

비밀번호를 `DB_PW`로 한 번만 적고 두 연결 문자열이 그것을 참조하는 구조를 눈여겨보자.
비밀번호를 바꿀 일이 생겨도 고칠 곳이 한 군데다.
포트가 6543과 5432로 갈린 것은 앞에서 말한 풀러와 직접 연결의 차이다.

파일을 만들면 direnv가 곧바로 실어 주지는 않는다.

```
direnv: error .envrc is blocked. Run `direnv allow` to approve its content
```

낯선 저장소를 클론했을 때 그 안의 `.envrc`가 임의의 셸 명령을 실행할 수 있다는 것을 생각하면 당연한 경계다.
내용을 눈으로 확인한 뒤 승인한다.

```bash
direnv allow
```

이제 저장소 디렉터리로 `cd` 하는 것만으로 다섯 개 변수가 셸에 올라온다.
`go run ./cmd/server`도, `go run ./cmd/migrate`도 앞에 아무것도 붙이지 않고 그냥 실행된다.
디렉터리를 벗어나면 변수는 사라지므로, 다른 프로젝트의 `DATABASE_URL`과 뒤섞이는 사고도 막아 준다.

가장 중요한 것은 `.envrc`가 저장소에 커밋되지 않는다는 점이다.
`.gitignore`에 `.envrc`와 `.env*`가 들어 있고, `.env.local.example`만 예외로 열어 두었다.

```
# env files (can opt-in for committing if needed)
.env*
!.env.local.example

# direnv
.envrc
```

즉 저장소에는 "어떤 변수가 필요한지"를 알려 주는 예시 파일만 들어가고, 실제 값은 각자의 기계에만 남는다.
새로 합류한 사람이 하는 일은 `.env.local.example`을 열어 목록을 확인하고, 자기 값으로 `.env.local`과 `.envrc`를 채우는 것이다.

## .vscode: 에디터가 프로젝트의 규칙을 실어 나른다

환경 변수가 준비됐으면 이제 코드를 만질 차례다.

에디터 설정은 보통 개인의 영역이다.
글꼴 크기나 색 테마를 저장소에 강요할 이유는 없다.
그러나 "이 프로젝트의 Go 파일은 저장할 때 gofmt를 돌린다", "타입 검사는 이 명령으로 한다" 같은 규칙은 취향이 아니라 프로젝트의 성질이다.
이런 규칙이 각자의 머릿속에만 있으면 새로 합류한 사람도, AI 에이전트도 알 길이 없다.

VS Code는 작업 폴더의 `.vscode/` 디렉터리를 읽어 개인 설정 위에 덮어쓴다.
프로젝트에 종속된 규칙만 골라 이 디렉터리에 담아 커밋하면, 클론한 사람은 별도 안내 없이 같은 환경을 얻는다.

```
.vscode/
├── extensions.json   # 이 프로젝트에 필요한 확장
├── settings.json     # 저장 시 포맷, 언어별 포매터, 검색 제외
├── tasks.json        # go build·go test·tsc 같은 검증 명령
└── launch.json       # Go API와 Next dev 디버깅 구성
```

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

VS Code는 이 목록을 읽고 "이 저장소가 권장하는 확장이 있습니다"라고 안내한다.
강제 설치가 아니라 추천이다.

`golang.go`는 Go 공식 확장으로 뒤에서 볼 포맷·검사·디버깅이 모두 여기에 얹힌다.
`bradlc.vscode-tailwindcss`는 Tailwind 클래스 이름을 자동 완성해 준다.
`vitest.explorer`는 9장에서 본 vitest 테스트를 에디터 옆 목록에서 하나씩 실행하게 해 준다.
`anthropic.claude-code`는 12장의 Claude Code를 에디터 안에서 띄우는 확장이다.

목록이 짧은 것은 의도한 결과다.
이 저장소에는 ESLint도 Prettier도 없다.
Go 쪽은 gofmt가 포맷을 독점하고 TypeScript 쪽은 `tsc`의 strict 모드가 검증을 맡는 구성이라, 포매터와 린터를 따로 들일 이유가 없었다.

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
  "go.testFlags": ["-count=1"],

  "[typescript]": {
    "editor.defaultFormatter": "vscode.typescript-language-features"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "vscode.typescript-language-features"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,

  "search.exclude": {
    "**/node_modules": true,
    "out": true,
    ".next": true,
    "doc/.vitepress/dist": true
  },

  "files.insertFinalNewline": true,
  "files.trimTrailingWhitespace": true
}
```

`editor.formatOnSave`가 켜져 있고 `[go]` 블록이 포매터를 Go 확장으로 지정하므로, Go 파일을 저장하는 순간 gofmt가 돈다.
6장에서 본 세로 정렬이 여기서 자동으로 맞춰진다.
`source.organizeImports`는 저장할 때 쓰지 않는 import를 지우고 남은 것을 표준 순서로 정렬한다.
Go는 쓰지 않는 import를 컴파일 에러로 처리하므로, 이 한 줄이 "빌드는 되는데 import만 어긋난" 상태를 아예 만들지 않는다.

`go.vetOnSave`를 `package`로 두면 저장할 때마다 그 파일이 속한 패키지에 `go vet`이 돌아, 6장에서 본 정적 분석이 편집 중에 밑줄로 나타난다.
`go.testFlags`의 `-count=1`은 테스트 캐시를 끄는 관용적인 방법으로, 에디터에서 테스트를 다시 돌릴 때 이전 결과를 그대로 보여 주는 일을 막는다.

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
그래도 tasks로 등록하는 이유는 두 가지다.
명령을 외우지 않아도 되고, VS Code가 출력에서 파일과 줄 번호를 뽑아 문제 목록으로 만들어 주기 때문이다.

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

마지막 `전체 검증` 태스크는 앞의 다섯을 순서대로 묶는다.
`dependsOrder`를 `sequence`로 두었으므로 하나라도 실패하면 거기서 멈춘다.
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
      "program": "${workspaceFolder}/cmd/server",
      "envFile": "${workspaceFolder}/.env.local"
    },
    {
      "name": "Go: 현재 파일의 패키지 테스트",
      "type": "go",
      "request": "launch",
      "mode": "test",
      "program": "${fileDirname}"
    },
    {
      "name": "Next dev",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev",
      "serverReadyAction": {
        "pattern": "- Local:.+(https?://.+)",
        "uriFormat": "%s",
        "action": "debugWithChrome"
      }
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

첫 구성의 `envFile`은 direnv를 쓰지 않거나 direnv를 거치지 않고 디버거를 띄우는 경우를 위한 안전망이다.
VS Code를 터미널에서 `code .`로 열면 direnv가 실어 준 변수를 그대로 물려받지만, 런처 아이콘으로 여는 경우에는 그렇지 않다.
`envFile`을 지정해 두면 어느 쪽으로 열든 디버거가 값을 찾는다.

`compounds`는 여러 구성을 한 번에 띄우는 장치다.
`풀스택`을 실행하면 Go API와 Next dev가 함께 뜨고, `stopAll`이 켜져 있어 한쪽을 멈추면 다른 쪽도 함께 내려간다.
프런트에서 카드를 뒤집을 때 Go 핸들러의 중단점이 걸리는 것을 한 창에서 볼 수 있다.

Go 디버깅에는 델브(Delve)가 필요하다.
`dlv` 실행 파일이 없으면 Go 확장이 설치하겠느냐고 물으므로 따로 챙길 것은 없지만, 저장소를 클론한 직후에는 아직 설치되어 있지 않다는 점만 알아 두자.

## 사람의 입구와 에이전트의 입구

여기까지 읽었다면 기시감이 들 것이다.
저장할 때 gofmt를 돌리고 `go vet`을 확인하는 일은, 13장에서 본 훅이 에이전트에게 하는 일과 정확히 같다.

차이는 대상이다.
사람이 에디터에서 파일을 저장하면 `settings.json`의 `formatOnSave`가 gofmt를 돌리고, 에이전트가 도구로 파일을 쓰면 `.claude/hooks/go-check.sh`가 gofmt를 돌린다.
같은 규칙이 두 개의 입구에 각각 걸려 있다.

이것이 우연이 아니라는 데 이 장의 요점이 있다.
사람과 에이전트가 같은 저장소를 고치는데 포맷 규칙이 서로 다르면, 두 쪽이 번갈아 파일을 건드릴 때마다 의미 없는 diff가 쌓인다.
규칙을 저장소에 한 번 적어 두고 양쪽 입구에 똑같이 걸어 두면 누가 고쳤든 결과물의 모양이 같다.
설정 옵션이 없는 `gofmt`를 쓰는 이점이 여기서 한 번 더 나타난다.
사람의 에디터와 에이전트의 훅이 같은 결과에 도달한다는 것을 따로 맞춰 볼 필요가 없다.

Claude Code도 두 입구를 오간다.
12장에서 본 CLI를 터미널에서 그대로 써도 되고, `anthropic.claude-code` 확장으로 에디터 안에서 띄워도 된다.
에디터 안에서 돌릴 때 실질적으로 달라지는 것은 변경 사항을 읽는 방식이다.
터미널에서는 diff가 텍스트로 흘러가지만, 확장을 쓰면 에디터의 diff 뷰로 열려 좌우를 나란히 놓고 볼 수 있다.
어느 쪽을 쓰든 에이전트가 하는 일은 같고, 품질을 지키는 장치는 어디까지나 저장소에 적힌 규칙이다.

## 이 구성이 내주는 것

로컬 환경을 저장소에 적어 두는 선택에도 대가가 있다.

첫째, `.vscode/`는 VS Code에 맞춘 설정이라 다른 에디터를 쓰는 사람에게는 도움이 되지 않는다.
Neovim이나 JetBrains GoLand를 쓰는 사람은 같은 규칙을 자기 환경에 손으로 옮겨야 한다.
이 위험을 줄이는 방법은 규칙의 원본을 에디터 바깥에 두는 것이다.
Echo Flip에서 포맷의 원본은 `gofmt`이고 검증의 원본은 `go vet`과 `tsc`이며, `.vscode/`는 그 명령들을 편하게 부르는 껍데기다.
에디터를 바꿔도 따라오지 못할 규칙이 없다.

둘째, direnv는 셸에 훅을 거는 도구라 팀원 각자가 설치해야 하고, `.envrc`가 임의의 셸 코드를 실행할 수 있다는 성질도 함께 온다.
`direnv allow`라는 승인 절차가 그 대가로 붙어 있다.
direnv를 쓰지 않겠다면 `.env.local`을 셸에서 직접 `source`하거나 명령마다 변수를 앞에 붙이면 되고, 앱은 아무 차이도 알아채지 못한다.

셋째, `settings.json`에 개인 취향을 섞기 시작하면 금세 다툼거리가 된다.
글꼴, 색 테마, 탭 표시 폭처럼 커밋되는 파일의 내용을 바꾸지 않는 항목은 개인 설정에 두고, 저장소에는 파일 내용을 바꾸는 규칙만 남기는 것이 경계선이다.
`files.trimTrailingWhitespace`가 저장소에 들어간 이유도 그것이 취향이 아니라 커밋 내용을 바꾸는 규칙이기 때문이다.

## 정리

첫째, 로컬 실행은 Go API(8080)와 Next 개발 서버(3000) 두 프로세스로 이뤄지고, 그 앞에 마이그레이션 한 번이 필요하다.
오리진이 갈리므로 `ALLOWED_ORIGINS`로 CORS를 열어 줘야 하고, 마이그레이션은 풀러가 아닌 직접 연결로 붙는다.

둘째, Next.js는 `.env.local`을 스스로 읽고 `NEXT_PUBLIC_` 접두사가 붙은 값만 브라우저로 내려보낸다.
Go는 `.env`를 읽지 않고 셸의 환경 변수만 본다.
배포 환경이 값을 프로세스에 주입하는 방식과 같기 때문이며, 로컬과 배포의 설정 경로를 일치시키려는 선택이다.

셋째, direnv는 디렉터리에 들어갈 때 `.envrc`의 변수를 자동으로 export한다.
`direnv allow`로 한 번 승인하면 그 뒤로는 `go run ./cmd/server`를 아무 접두사 없이 실행할 수 있고, `.envrc`는 커밋되지 않으므로 비밀은 각자의 기계에만 남는다.

넷째, `.vscode/` 네 파일은 포맷과 검증 명령, 디버깅 구성을 저장소가 실어 나르게 한다.
`전체 검증` 태스크 하나가 Go와 프런트엔드의 검사를 순서대로 묶고, `compounds`가 두 프로세스를 한 번에 띄운다.

다섯째, 에디터의 저장 시 포맷과 에이전트의 훅은 같은 규칙을 사람 쪽 입구와 에이전트 쪽 입구에 각각 걸어 둔 구성이다.
규칙의 원본을 `gofmt`·`go vet`·`tsc`처럼 에디터 바깥의 명령에 두었기 때문에 두 입구가 어긋나지 않는다.

이제 로컬에서 돌아가는 앱이 생겼다.
그런데 방금 갖춘 두 게이트, 즉 에이전트의 훅과 사람의 태스크에는 공통된 빈틈이 있다.
둘 다 로컬에서 도는 검사라서, 돌리지 않고도 코드를 푸시할 수 있다는 것이다.

다음 15장에서는 그 빈틈을 메우는 세 번째 게이트를 만든다.
저장소에 코드가 도착하는 순간 깨끗한 원격 기계에서 자동으로 도는 검사, 곧 GitHub Actions다.
