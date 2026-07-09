# 9장 Vercel — 한 플랫폼에 모두 배포하기

지금까지 1부에서 Echo Flip의 코드를 언어와 프레임워크 관점에서 읽었다면, 이 장부터는 그 코드를 실제로 돌리는 인프라를 살펴본다.
이 장에서는 Next.js 정적 프런트엔드와 Go API를 Vercel이라는 단일 플랫폼에 함께 배포하는 구성을 해부해 보겠다.
왜 상주 서버가 아니라 서버리스(serverless)를, 여러 플랫폼이 아니라 하나의 플랫폼을 골랐는지 선택 과정부터 되짚고, `vercel.json`과 `api/index.go`가 이 구성을 어떻게 실현하는지 코드 수준에서 확인한다.
그 과정에서 Vercel Go 런타임 특유의 제약이 저장소의 디렉터리 구조에까지 영향을 준 이야기도 함께 다룬다.

## 왜 Vercel인가

### 요구사항에서 출발하기

기술 선택은 늘 요구사항에서 출발해야 한다.
도입에서 정리했듯 Echo Flip의 비기능 요구사항은 세 가지로 압축된다.

첫째, 완전 무료여야 한다.
개인 학습용 앱에 매달 고정 비용을 낼 생각은 없었다.
"트래픽이 늘면 그때 가서 고민한다"가 기본 방침이고, 개인용 암기 앱의 트래픽은 사실상 늘지 않는다.

둘째, 관리할 플랫폼이 최소여야 한다.
혼자 만들고 혼자 운영하는 앱이므로, 계정·대시보드·환경 변수·배포 파이프라인을 챙겨야 할 서비스가 늘어날수록 운영 부담이 비례해서 커진다.
플랫폼이 두 개면 장애가 났을 때 확인할 곳도 두 개고, 무료 정책이 바뀌는지 지켜봐야 할 곳도 두 개다.

셋째, 콜드스타트(cold start)가 최소여야 한다.
암기 앱은 하루에 몇 번, 짧게 쓰는 앱이다.
접속할 때마다 첫 응답이 수 초씩 걸린다면 "잠깐 복습하려던" 사용자는 그냥 앱을 닫는다.

이 세 요구사항은 서로 긴장 관계에 있다.
무료이면서 콜드스타트가 없으려면 상주 서버가 좋은데, 무료 상주 서버는 대개 관리 부담과 슬립(sleep) 문제를 데려온다.
이 긴장을 어떻게 풀었는지가 이 절의 이야기다.

### 첫 번째 안 — 무료 상주 서버에 Go를 올리기

처음 검토한 안은 전통적인 구도였다.
정적 프런트엔드는 Vercel이나 GitHub Pages 같은 정적 호스팅에 올리고, Go 서버는 Koyeb 같은 무료 상주 서버(always-on server) 플랫폼에 올리는 것이다.

이 안의 매력은 분명하다.
Go 서버가 늘 떠 있으므로 콜드스타트가 아예 없다.
`cmd/server`의 코드를 그대로 컨테이너에 담아 올리면 되니 로컬과 프로덕션의 실행 형태도 같다.
데이터베이스 커넥션 풀을 프로세스 수명 내내 유지할 수 있고, 인메모리 캐시 같은 상태도 자유롭게 쓸 수 있다.

그런데 따져 볼수록 감점 요소가 쌓였다.

첫째, 무료 티어의 지속성이 불안하다.
Koyeb, Fly.io, Render 같은 플랫폼의 무료 범위는 정책 변경이 잦았고, 무료 인스턴스에 슬립을 도입하거나 무료 범위 자체를 축소하는 방향으로 바뀌는 경우가 많았다.
무료 인스턴스가 슬립에 들어가면 깨우는 데 수 초에서 수십 초가 걸리는데, 이러면 상주 서버의 최대 장점인 "콜드스타트 없음"이 사라진다.
슬립을 막으려고 주기적으로 핑을 보내는 우회책도 있지만, 이는 플랫폼 정책과 숨바꼭질을 하는 셈이라 개인 프로젝트의 정신 건강에 좋지 않다.

둘째, 관리 대상이 하나 늘어난다.
프런트엔드용 플랫폼과 API용 플랫폼의 계정, 환경 변수, 배포 트리거를 각각 관리해야 한다.
프런트와 API의 오리진(origin)이 달라지므로 CORS(Cross-Origin Resource Sharing) 설정도 프로덕션에서 상시 필요해진다.
컨테이너로 배포한다면 Dockerfile과 베이스 이미지 업데이트라는 숙제도 따라온다.

이 감점 요소들을 보다가 문제의식이 바뀌었다.
"어느 무료 상주 서버가 제일 나은가"가 아니라 "플랫폼을 하나로 줄일 수는 없나"가 진짜 질문이었다.
정적 프런트엔드를 올릴 곳은 어차피 필요하니, 그곳이 API까지 실행해 줄 수 있다면 두 번째 플랫폼 자체가 사라진다.
Vercel의 서버리스 함수(Serverless Function)가 Go를 지원한다는 사실이 이 질문에 대한 답이 됐다.

### 상주 서버 vs 서버리스 — 일반 트레이드오프

Vercel로 결정하기 전에, 상주 서버와 서버리스라는 두 실행 모델의 일반적인 트레이드오프를 정리해 두자.
이 비교는 Echo Flip만이 아니라 어떤 프로젝트에서든 통용된다.

첫째, 콜드스타트.
상주 서버는 프로세스가 늘 떠 있으므로 콜드스타트가 없다(슬립하지 않는다는 전제에서).
서버리스는 요청이 뜸하면 인스턴스가 회수되고, 다음 요청은 런타임 기동부터 다시 시작한다.
다만 콜드스타트의 체감은 런타임에 따라 크게 다르다.
Go처럼 단일 바이너리로 컴파일되는 언어는 기동이 빠른 편이고, JVM처럼 기동 비용이 큰 런타임은 서버리스와 궁합이 나쁘다.
1장에서 Go를 고른 이유 중 하나가 바로 이 지점이었다.

둘째, 상태(state).
상주 서버는 프로세스 메모리에 캐시, 세션, 커넥션 풀을 안심하고 둘 수 있다.
서버리스는 인스턴스가 언제 사라질지 모르므로 메모리는 "있으면 좋은 캐시" 이상으로 신뢰할 수 없다.
따뜻한(warm) 인스턴스가 재사용되는 동안에는 전역 변수가 살아 있지만, 그것은 최적화이지 보장이 아니다.

셋째, 비용 모델.
상주 서버는 트래픽이 0이어도 인스턴스 비용이 나간다(무료 티어라면 무료 한도를 소모한다).
서버리스는 실행한 만큼만 과금되므로 트래픽이 적은 개인 앱에서는 사실상 0원에 수렴한다.
반대로 트래픽이 꾸준히 많다면 상주 서버 쪽이 단위 비용에서 유리해지는 교차점이 온다.

넷째, 실행 시간 제한.
서버리스 함수에는 요청당 실행 시간 제한이 있다(플랫폼과 요금제에 따라 수십 초에서 수 분 수준이다).
오래 걸리는 배치 작업, 웹소켓(WebSocket) 같은 장수 연결, 백그라운드 워커는 서버리스에 얹기 어렵다.
상주 서버에는 이런 제한이 없다.

Echo Flip의 API는 이 네 축에서 모두 서버리스 친화적이다.
요청은 전부 짧은 CRUD이고, 장수 연결이 없고, 상태는 전부 PostgreSQL에 있고, 트래픽은 적다.
콜드스타트라는 유일한 약점은 Go의 빠른 기동으로 상쇄한다.
만약 이 앱에 실시간 동기화(웹소켓)나 무거운 배치가 있었다면 결론은 달라졌을 것이다.

### 대안 비교 — 어디에 무엇을 올릴 수 있나

같은 "정적 + API" 구도를 놓고 검토한 플랫폼들을 비교해 보자.

| 플랫폼 | 정적 호스팅 | Go API | 평가 |
|---|---|---|---|
| Vercel | Next.js 1급 지원 | 서버리스 함수로 공식 지원 | 정적+함수 올인원, 플랫폼 1개로 완결 |
| Netlify | 지원 | 함수 지원은 있으나 JS/TS 중심 생태계 | 구도는 비슷하나 Next.js·Go 조합의 마찰이 더 큼 |
| Cloudflare Pages/Workers | 지원, 엣지 강점 | 네이티브 Go 불가 — Workers는 JS/WASM 실행 모델 | Go를 WASM으로 컴파일하는 우회는 제약이 많음 |
| GitHub Pages | 지원 | 불가 (정적 전용) | API가 없다면 가장 단순한 선택 |
| Koyeb/Fly.io 등 무료 상주 서버 | 부수적 | 컨테이너/바이너리로 자유롭게 실행 | 콜드스타트 없음, 대신 슬립·정책 변경·플랫폼 추가 부담 |

각 대안이 더 나은 경우도 짚어 두겠다.

Netlify는 정적 사이트 중심에 가벼운 함수를 곁들이는 구도라면 Vercel과 대등한 선택이다.
다만 이 프로젝트는 프런트엔드가 Next.js이고 API가 Go라서, Next.js를 만든 회사가 운영하며 Go 함수 런타임을 공식 제공하는 Vercel 쪽이 양쪽 모두에서 마찰이 적었다.

Cloudflare Pages/Workers는 전 세계 엣지(edge)에서 실행되는 모델이 강점이라, 전 세계 사용자를 상대하는 지연 민감 서비스라면 유력한 후보다.
그러나 Workers는 V8 기반 JavaScript/WASM 실행 모델이어서 Go를 네이티브로 돌릴 수 없다.
Go를 WASM으로 컴파일해 올리는 길이 있긴 하지만 표준 라이브러리와 데이터베이스 드라이버 호환에 제약이 따르므로, 이 프로젝트의 "Go + pgx" 스택과는 맞지 않았다.
API를 TypeScript로 쓸 계획이라면 이야기가 다르다.

GitHub Pages는 API가 아예 없는 순수 정적 사이트라면 저장소와 호스팅이 한 몸이 되는 가장 단순한 답이다.
Echo Flip은 인증과 데이터베이스가 필요하므로 처음부터 후보에서 제외됐다.

Koyeb나 Fly.io 같은 무료 상주 서버는 웹소켓·백그라운드 작업·긴 요청이 필요하거나, 콜드스타트를 한 번도 용납할 수 없는 서비스라면 여전히 옳은 선택이다.
Echo Flip은 그 어느 쪽도 아니었기에, 플랫폼 하나를 줄이는 쪽의 이득이 더 컸다.

정리하면 Vercel 선택의 결정타는 특정 기능이 아니라 구도다.
정적 프런트엔드와 Go API를 한 저장소, 한 플랫폼, 한 번의 `git push`로 배포할 수 있다는 것.
무료 티어 기준으로 개인 프로젝트를 충분히 감당하고, 콜드스타트는 Go로 최소화한다.
이것이 세 요구사항을 모두 만족하는 유일한 조합이었다.

다만 "무료 티어로 충분하다"는 판단은 감이 아니라 수치로 뒷받침되어야 한다.
Hobby 플랜이 무엇을 어디까지 무료로 주는지, 절을 바꿔 구체적으로 따져 보자.

## 무료 티어로 어디까지 갈 수 있는가

무료 티어에 앱을 올린다는 것은 결국 "이 한도 안에서 살겠다"는 계약이다.
무엇이 포함되고, 한도가 얼마이고, 넘으면 어떻게 되는지를 알아야 안심하고 운영할 수 있다.

### Hobby 플랜에 포함되는 것

Vercel의 무료 요금제인 Hobby 플랜은 결제 수단 등록 없이 다음을 제공한다.

첫째, 정적 호스팅과 글로벌 CDN(Content Delivery Network)이다.
빌드 결과물이 전 세계 엣지 서버에서 캐싱·서빙되며, 별도 설정도 비용도 없다.

둘째, 서버리스 함수다.
Node.js만이 아니라 Go·Python·Ruby 런타임까지 무료 플랜에서 그대로 쓸 수 있고, Echo Flip의 `api/index.go`가 바로 이것을 사용한다.

셋째, 자동 HTTPS와 커스텀 도메인이다.
기본 제공되는 `*.vercel.app` 주소는 물론 직접 소유한 도메인을 프로젝트당 50개까지 연결할 수 있고, 인증서 발급과 갱신은 전부 자동이다.

넷째, GitHub 연동 자동 배포와 프리뷰 배포(Preview Deployment)다.
push마다 자동으로 빌드·배포되고 브랜치마다 프리뷰 URL이 발급되는 흐름을 무료로 쓸 수 있으며, 구체적인 동작은 다음 절에서 본다.

상용 환경이라면 CDN, 인증서 관리, CI/CD 파이프라인으로 각각 따로 구축하거나 사야 할 것들이 무료 플랜에 기본으로 들어 있는 셈이다.

### 주요 한도 — 2026년 7월 기준

포함 범위보다 중요한 것은 한도다.
2026년 7월 시점의 Vercel 공식 문서와 요금 페이지 기준으로, Echo Flip 같은 구성에 유의미한 한도는 다음과 같다.

| 항목 | Hobby 한도 |
|---|---|
| 대역폭(Fast Data Transfer) | 월 100GB |
| 엣지 요청(Edge Requests) | 월 100만 회 |
| 함수 호출(Function Invocations) | 월 100만 회 |
| 함수 활성 CPU(Active CPU) | 월 4시간 |
| 함수 프로비저닝 메모리(Provisioned Memory) | 월 360GB-시간 |
| 함수 실행 시간 | 요청당 최대 300초(5분) |
| 배포 횟수 | 하루 100회 |
| 빌드 | 1회당 최대 45분(2 vCPU, 8GB 메모리 컨테이너) |

활성 CPU라는 지표가 낯설 수 있는데, 함수가 실제로 CPU를 사용한 시간만 세는 값이다.
Echo Flip의 API처럼 실행 시간 대부분이 데이터베이스 응답 대기인 워크로드는 벽시계 시간보다 훨씬 적게 소모한다.

주의할 점은 이 수치들이 고정 불변이 아니라는 것이다.
Vercel은 함수 과금 지표를 개편하는 등 요금 체계를 여러 번 바꿔 왔다.
월간 빌드 시간 총량처럼 이 표에 없는 항목이나 최신 수치는 요금 페이지(vercel.com/pricing)와 공식 문서에서 직접 확인하기 바란다.

### 한도를 넘으면 — 차단이지 과금이 아니다

Hobby 플랜에는 청구서가 없다.
결제 수단을 등록하지 않으므로 초과 사용이 요금으로 전환될 경로 자체가 없고, 한도를 넘으면 해당 기능이 일시 중지되어 대개 30일이 지나야 다시 쓸 수 있다.

"자고 일어났더니 요금 폭탄"이 구조적으로 불가능하다는 점은 개인 개발자에게 결정적인 안전장치다.
반대로 서비스가 정말 성장했다면 어느 날 앱이 멈춘다는 뜻이기도 하므로, 사용량 대시보드가 한도의 절반을 넘기 시작하면 그때가 유료 전환을 검토할 시점이다.

### 약관상 제약 — 개인·비상업 용도

수치보다 먼저 걸리는 제약은 약관이다.
Vercel의 공정 사용 정책(fair use guidelines)은 Hobby 플랜을 개인적·비상업적 용도로 제한한다.
광고를 붙이거나, 유료 기능을 팔거나, 회사 서비스의 일부로 쓰는 순간 이 조건을 벗어난다.

판단 기준은 단순하게 잡는 것이 좋다.
이 앱이 돈을 벌기 시작하는가.
수익화하는 시점이 곧 Pro 플랜(사용자당 월 $20) 전환 시점이고, 그 시점이라면 월 $20을 감당할 근거도 이미 생긴 것이다.
학습용·개인용인 Echo Flip은 이 제약과 무관하지만, 이 책의 구성을 상업 프로젝트에 가져다 쓸 독자라면 처음부터 Pro 기준으로 계산해야 한다.

### Echo Flip 규모에서의 여유

이 한도가 Echo Flip 규모의 앱에 얼마나 여유 있는지 감을 잡아 보자.
혼자 쓰는 암기 앱에서 하루 학습 세션 몇 번, API 호출을 넉넉히 하루 100회로 잡아도 월 3,000회다.
함수 호출 한도 100만 회의 0.3%에 불과하고, 요청당 활성 CPU를 후하게 10ms로 쳐도 월 30초로 4시간 한도의 0.2% 수준이다.
대역폭도 첫 방문에 정적 번들 수백 KB, 이후는 캐시와 수 KB짜리 JSON 응답뿐이라 월 100GB에 흔적도 내기 어렵다.
매일 쓰는 사용자가 100명으로 늘어도 자릿수가 두 개 커질 뿐 여전히 한도 안이며, 그 전에 비상업 조건이나 10장에서 다룰 Supabase 무료 티어의 한도가 먼저 신호를 보낼 것이다.

### 무료의 대가 — 감수해야 하는 것들

물론 공짜에는 대가가 있다.

첫째, 콜드스타트를 그대로 맞는다.
유료 플랜의 워밍업 옵션 없이 감수해야 하는데, 이를 Go로 최소화하는 이야기는 이 장 뒤의 콜드스타트 절에서 다룬다.

둘째, SLA(Service Level Agreement)가 없다.
가용성 보장도 장애 보상도 없고, 문제가 생겨도 이메일 지원 없이 문서와 커뮤니티로 해결해야 한다.

셋째, 런타임 로그가 1시간만 보존된다.
어젯밤에 난 에러를 아침에 들여다볼 수 없다는 뜻이다.

넷째, 무료 범위는 계약이 아니라 정책이다.
앞서 무료 상주 서버들의 정책 변경 이력을 봤듯, Vercel의 무료 한도 역시 언젠가 바뀔 수 있다는 전제로 운영해야 한다.

이 대가 목록이 감수 가능한 동안 무료 티어는 정답이고, Echo Flip은 그 전형적인 사례다.

## 정적 사이트 배포 — Next.js export를 CDN에 얹기

이제 실제 구성으로 들어가 보자.
먼저 프런트엔드다.

5장에서 다뤘듯 Echo Flip의 프런트엔드는 Next.js의 정적 export(static export)를 사용한다.
서버 컴포넌트 렌더링이나 API 라우트 같은 Next.js의 서버 기능을 포기하는 대신, 빌드 결과가 순수 HTML/CSS/JS 파일 묶음이 된다.
설정은 `next.config.ts`의 `output: "export"` 한 줄이다.

`next.config.ts`:

```ts
import type { NextConfig } from "next";

// Static export: the frontend deploys as pure static files on Vercel while
// /api/* is served by the Go function (see vercel.json rewrites).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: { root: __dirname },
};
```

`next build`를 실행하면 `out/` 디렉터리에 정적 파일이 생성된다.
Vercel은 이 결과물을 CDN에 올려 전 세계 엣지에서 서빙한다.
정적 파일 서빙에는 서버 프로세스가 필요 없으므로 콜드스타트라는 개념 자체가 없고, 무료 티어에서도 부담이 없다.
"프런트엔드는 무조건 정적으로"라는 결정이 콜드스타트 걱정의 범위를 API로만 좁혀 준 셈이다.

::: info [용어 풀이] CDN(Content Delivery Network)
전 세계 곳곳에 놓인 서버에 같은 파일의 복사본을 미리 뿌려 두고, 방문자에게 가장 가까운 서버가 응답하게 하는 배달망이다.
서울에서 접속하면 서울 근처 서버가, 뉴욕에서 접속하면 뉴욕 근처 서버가 같은 화면을 건네므로 어디서 열어도 빠르다.
인기 프랜차이즈가 동네마다 지점을 두어 배달 거리를 좁히는 것과 같다.
:::

배포 트리거는 GitHub 저장소 연동이다.
Vercel 프로젝트에 저장소를 연결해 두면 `main` 브랜치에 push할 때마다 자동으로 빌드와 배포가 실행된다.
별도의 CI 설정 파일 없이, Vercel이 저장소 루트에서 Next.js 프로젝트를 감지해 `next build`를 실행하고 `out/`을 배포한다.

::: info [용어 풀이] 빌드와 배포
빌드(build)는 사람이 쓴 소스 코드를 기계가 실제로 돌릴 수 있는 형태로 변환·조립하는 과정이고, 배포(deploy)는 그 결과물을 사용자가 접속하는 서버에 올려 실제로 서비스되게 하는 과정이다.
원고를 인쇄용 파일로 짜는 일이 빌드라면, 그 책을 서점 매대에 올리는 일이 배포다.
Vercel은 이 두 단계를 push 한 번에 자동으로 이어서 실행한다.
:::

`main`이 아닌 브랜치에 push하거나 풀 리퀘스트를 열면 프리뷰 배포가 만들어진다.
브랜치마다 고유 URL이 발급되어 프로덕션에 영향 없이 변경 사항을 실제 환경에서 확인할 수 있다.
혼자 개발하는 프로젝트에서도 "머지 전에 진짜 배포 환경에서 눌러 보기"가 공짜로 생기는 것은 꽤 유용하다.

## Go 서버리스 함수 — api/ 디렉터리 하나로 API 전체를

### Vercel Go 런타임의 동작 방식

Vercel의 함수 배포 규약은 파일 시스템 기반이다.
저장소의 `api/` 디렉터리에 놓인 파일이 각각 하나의 서버리스 함수가 된다.
`.go` 파일을 발견하면 Vercel이 Go 런타임으로 컴파일하며, 파일은 표준 `net/http` 시그니처의 핸들러 함수를 내보내면(export) 된다.

```go
func Handler(w http.ResponseWriter, r *http.Request)
```

이 규약대로라면 `api/decks.go`, `api/cards.go`처럼 엔드포인트마다 파일을 만들어 함수를 쪼개는 구성도 가능하다.
그러나 Echo Flip은 반대 방향을 택했다.
함수를 딱 하나만 만들고, 그 안에서 Gin 라우터가 모든 경로를 처리하게 한다.

이유는 세 가지다.

첫째, 코드 재사용이다.
3장에서 만든 Gin 라우터(`pkg/app`)를 그대로 쓰면 로컬 서버와 프로덕션이 완전히 같은 코드로 동작한다.
함수를 쪼개면 라우팅·미들웨어·인증을 Vercel의 파일 규약에 맞춰 다시 조립해야 한다.

둘째, 콜드스타트 표면적이다.
함수가 열 개면 따뜻하게 유지해야 할 인스턴스도 열 종류다.
사용자가 덱 목록을 보다가 카드 상세로 이동하면, 각각 다른 함수의 콜드스타트를 맞을 수 있다.
함수가 하나면 첫 요청 한 번으로 API 전체가 따뜻해진다.

셋째, 관리 단순성이다.
환경 변수, 로그, 리전 설정이 함수 하나에만 적용되면 된다.

물론 단일 함수에도 대가는 있다.
모든 엔드포인트가 한 함수의 메모리·실행 시간 제한을 공유하고, 특정 엔드포인트만 따로 스케일하거나 다른 리전에 둘 수 없다.
엔드포인트별 트래픽 특성이 크게 다른 서비스라면 함수를 나누는 쪽이 낫지만, 개인 앱의 균질한 CRUD 트래픽에서는 단일 함수의 단순함이 압도적으로 이득이다.

### catch-all 함수 — api/index.go

::: info [용어 풀이] 캐치올(Catch-all)
정해진 몇몇 주소만 따로 받는 대신, 특정 범위의 모든 주소를 하나가 통째로 받아 처리하도록 만든 것을 캐치올이라 한다.
전화가 부서마다 따로 있지 않고 대표번호 하나로 다 걸려 온 뒤 안에서 담당자에게 연결되는 것과 같다.
여기서는 `/api/` 아래 모든 요청을 함수 하나가 받아, 그 안의 Gin 라우터가 경로별로 나눠 처리한다.
:::

단일 함수의 실체를 보자.
`api/index.go` 전체가 다음과 같다.

`api/index.go`:

```go
// Package handler is the Vercel serverless entrypoint. vercel.json rewrites
// every /api/* request here; the original path is preserved, so the Gin
// router dispatches normally.
//
// Vercel compiles this file outside the module, so it must not import
// internal/ packages (directly); shared code it needs lives in pkg/.
package handler

import (
	"net/http"

	"github.com/benelog/echo-flip/pkg/app"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	engine, err := app.Engine()
	if err != nil {
		http.Error(w, "server misconfigured: "+err.Error(), http.StatusInternalServerError)
		return
	}
	engine.ServeHTTP(w, r)
}
```

핵심은 마지막 한 줄, `engine.ServeHTTP(w, r)`다.
3장에서 봤듯 Gin의 `*gin.Engine`은 표준 `http.Handler` 인터페이스를 구현한다.
그래서 Vercel이 요구하는 `net/http` 핸들러 안에서 Gin 엔진에 요청을 그대로 넘기면, 이후의 경로 매칭·미들웨어·핸들러 실행은 전부 Gin이 알아서 한다.
Vercel 함수는 Gin 앱을 감싸는 얇은 어댑터일 뿐이다.

`app.Engine()`이 반환하는 엔진은 `pkg/app/app.go`에서 조립된다.
서버리스 관점에서 눈여겨볼 부분은 `sync.Once`다.

`pkg/app/app.go` (조립 코드 일부):

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
```

`build()`는 환경 변수 로딩, 데이터베이스 커넥션 풀 생성, 라우터·미들웨어 조립을 수행하는 비싼 초기화다.
`sync.Once`로 감싸 두면 이 초기화는 프로세스당 한 번만 실행된다.
서버리스 인스턴스는 요청이 이어지는 동안 프로세스를 재사용하므로(warm instance), 두 번째 요청부터는 이미 만들어진 엔진과 커넥션 풀을 그대로 쓴다.
앞 절에서 말한 "따뜻한 인스턴스의 전역 변수는 최적화이지 보장이 아니다"라는 원칙 그대로, 인스턴스가 회수되면 다음 콜드스타트에서 다시 초기화될 뿐 정합성 문제는 없다.
상태의 원본은 전부 PostgreSQL에 있기 때문이다.

같은 엔진을 로컬 개발 서버도 사용한다.

`cmd/server/main.go`:

```go
// Local dev server: go run ./cmd/server (reads .env vars from the shell).
package main

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

`app.Engine()`이라는 하나의 조립 지점을 두 진입점이 공유한다.
로컬은 `engine.Run()`으로 포트를 열어 상주 서버처럼 돌고, Vercel은 `engine.ServeHTTP()`로 요청 단위 실행을 한다.
실행 모델은 다르지만 라우팅·인증·비즈니스 로직은 완전히 동일하므로, "로컬에서 되는데 프로덕션에서 안 되는" 종류의 차이가 구조적으로 줄어든다.

### rewrite로 모든 API 경로를 한 함수로

남은 퍼즐 조각은 라우팅이다.
Vercel의 파일 규약대로라면 `api/index.go`는 `/api/index` 경로만 담당한다.
`/api/decks`나 `/api/me` 같은 요청을 이 함수로 보내려면 재작성(rewrite) 규칙이 필요하다.
`vercel.json`의 첫 번째 rewrite가 그 역할을 한다.

::: info [용어 풀이] 리라이트(Rewrite)
겉으로 보이는 주소와 실제로 그 요청을 처리하는 위치를 다르게 이어 주는 서버 속 안내판이다.
방문자는 `/api/decks`로 문을 두드렸다고 여기지만, 서버는 뒤에서 조용히 `/api/index` 창구로 안내한다.
주소를 아예 바꿔 다시 요청하게 만드는 리다이렉트와 달리, 브라우저 주소창은 그대로 두고 처리할 곳만 바꾼다.
:::

```json
{ "source": "/api/:path*", "destination": "/api/index" }
```

`:path*`는 0개 이상의 경로 세그먼트에 매칭되는 패턴이다.
`/api/` 아래의 모든 요청이 `/api/index` 함수, 즉 `api/index.go`의 `Handler`로 모인다.

여기서 중요한 성질이 하나 있다.
rewrite는 리다이렉트와 달리 요청 URL을 바꾸지 않는다.
함수에 도착한 `*http.Request`의 경로는 여전히 `/api/decks/ab3f` 그대로다.
그래서 Gin 라우터에 등록된 `api.GET("/decks/:slug", h.GetDeck)` 같은 라우트가 아무 변환 없이 정상적으로 매칭된다.
`api/index.go`의 주석에 적힌 "the original path is preserved, so the Gin router dispatches normally"가 바로 이 이야기다.

## Vercel Go 함수의 제약과 대응

### internal 패키지를 import할 수 없다

여기까지 보면 매끄러운 구성이지만, 이 구조에 도달하기까지 Vercel Go 런타임의 제약 하나를 우회해야 했다.
`api/index.go`의 주석 두 번째 문단이 그 흔적이다.

```go
// Vercel compiles this file outside the module, so it must not import
// internal/ packages (directly); shared code it needs lives in pkg/.
```

이 주석이 가리키는 제약을 일상어로 옮기면, 플랫폼이 정한 컴파일 방식 탓에 이 진입점 파일이 앱 안쪽에 감춰 둔 코드를 직접 가져다 쓸 수 없다는 뜻이다.
그래서 공유해야 할 코드의 위치를 옮겨야 했는데, 그 사정을 아래에서 하나씩 따라가 보자.

2장에서 다뤘듯 Go에는 `internal` 디렉터리 관례가 있다.
`internal/` 아래의 패키지는 그 부모 디렉터리를 루트로 하는 서브트리 안에서만 import할 수 있고, 바깥에서 import하면 컴파일러가 거부한다.
Echo Flip도 이 관례를 따라 설정(`internal/config`), 데이터 접근(`internal/store`), 핸들러(`internal/handlers`) 등 앱의 내부 구현을 전부 `internal/`에 두었다.

문제는 Vercel의 빌드 방식이다.
Vercel은 `api/index.go`를 저장소 모듈의 일원으로 빌드하지 않고, 함수 진입점으로서 모듈 외부에서 단독 컴파일한다.
모듈 바깥에서 컴파일되는 코드는 `github.com/benelog/echo-flip/internal/...` 패키지에 대해 "외부인"이므로, `api/index.go`가 `internal/` 패키지를 직접 import하면 Vercel 배포가 컴파일 에러로 실패한다.

대응은 구조적 결정이었다.
엔진 조립 코드를 `internal/app`이 아니라 `pkg/app`에 두는 것이다.
`pkg/`는 "외부에서 import해도 되는 공개 패키지"를 두는 관례적 위치이고, Vercel처럼 모듈 밖에서 컴파일되는 코드도 자유롭게 import할 수 있다.
그래서 import 그래프가 다음처럼 정리된다.

```text
api/index.go  ──▶  pkg/app  ──▶  internal/{config,db,auth,handlers,store}
cmd/server    ──▶  pkg/app
```

`api/index.go`가 직접 만나는 패키지는 `pkg/app` 하나뿐이다.
`pkg/app`은 모듈에 속한 정상적인 패키지이므로 `internal/` 패키지들을 마음껏 import할 수 있다.
즉 `internal`의 보호는 그대로 유지하면서, 모듈 경계 바깥의 진입점에게는 `pkg/app`이라는 공개 창구 하나만 열어 준 셈이다.
주석의 "(directly)"라는 단서가 이 구도를 정확히 표현한다 — 직접 import만 금지될 뿐, `pkg/app`을 경유한 간접 의존은 문제없다.

### 로컬 빌드로는 잡히지 않는 실패 — 별도 검사의 필요

이 제약에는 성가신 특징이 하나 있다.
로컬의 통상적인 빌드 검사로는 위반을 잡을 수 없다는 점이다.

`go build ./...`는 모든 패키지를 모듈의 일원으로 빌드한다.
이 관점에서 `api/index.go`는 모듈 내부 코드이므로, 설령 `internal/` 패키지를 직접 import하더라도 아무 에러가 나지 않는다.
로컬에서는 초록불인데 push하면 Vercel 빌드가 빨간불이 되는, 가장 발견이 늦고 짜증 나는 종류의 실패다.

다행히 이 실패를 로컬에서 재현하는 방법이 있다.
모듈 루트에서 파일 하나를 지목해 빌드하는 것이다.

```bash
go build api/index.go
```

Go는 파일 단위로 빌드를 지시받으면 그 파일을 `command-line-arguments`라는 임시 패키지로 취급하며, 이 패키지는 모듈 소속으로 인정되지 않는다.
따라서 `api/index.go`가 `internal/` 패키지를 직접 import하고 있다면 `use of internal package ... not allowed` 에러가 나고, Vercel에서 벌어질 실패를 push 전에 미리 볼 수 있다.

Echo Flip은 이 명령을 일회성 확인이 아니라 상시 품질 게이트로 만들었다.
8장에서 다룬 go-quality 서브에이전트의 검사 목록 마지막 항목이 바로 이것이다.

`.claude/agents/go-quality.md` (발췌):

```text
5. `go build api/index.go` — Vercel 서버리스 빌드 호환 검사. Vercel은 이 파일을
   모듈 외부에서 단독 컴파일하므로 `internal/` 패키지를 import하면 여기서 실패한다.
   이 검사가 실패하면 Vercel 배포도 실패한다는 점을 명시하라.
```

AI 에이전트와 함께 개발하는 프로젝트에서 이 검사는 특히 중요하다.
"Gin 핸들러 하나 추가해 줘" 같은 요청을 받은 에이전트가 `api/index.go`에 `internal/handlers`를 직접 import하는 코드를 쓰더라도, `go build ./...`와 테스트가 모두 통과하기 때문에 겉보기엔 멀쩡하다.
플랫폼 특유의 암묵적 제약은 이렇게 명시적 검사로 박제해 두지 않으면 반드시 다시 밟게 된다.

## vercel.json 해부

이제 이 배포 구성의 설계도인 `vercel.json`을 통째로 읽어 보자.
파일 전체가 열 줄 남짓이지만, 앞에서 다룬 결정들이 전부 이 안에 응축되어 있다.

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"],
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index" },
    { "source": "/decks/:slug", "destination": "/deck" },
    { "source": "/shared/:slug", "destination": "/shared-deck" },
    { "source": "/cards/:id", "destination": "/card" },
    { "source": "/decks/:slug/cards/new", "destination": "/card" }
  ]
}
```

### regions — 함수를 iad1에 고정하는 이유

`"regions": ["iad1"]`은 서버리스 함수의 실행 리전(region)을 미국 동부(버지니아 북부)로 고정한다.
CDN이 서빙하는 정적 파일은 전 세계 엣지에서 나가지만, Go 함수는 항상 iad1에서만 실행된다.

::: info [용어 풀이] 리전(Region)
서버가 물리적으로 놓인 지역이다.
클라우드 업체는 세계 여러 곳에 데이터 센터를 두는데, 그중 어디에서 코드를 돌릴지 고르는 것이 리전 선택이며 `iad1`은 미국 동부를 가리킨다.
데이터가 오가는 거리가 멀수록 응답이 늦어지므로, 어느 지역에 두느냐가 곧 지연 시간으로 나타난다.
:::

한국에서 쓰는 앱인데 왜 함수를 미국 동부에 두는가.
답은 데이터베이스와의 거리다.
API 요청 한 번은 대개 함수↔데이터베이스 왕복 여러 번을 동반한다.
인증 확인, 본 쿼리, 필요하면 후속 쿼리까지 왕복이 세 번이라면, 함수와 데이터베이스 사이 지연이 요청 전체 지연에 세 배로 곱해진다.

Echo Flip의 PostgreSQL은 Supabase 무료 티어에 있고, 그 프로젝트를 미국 동부(East US, North Virginia) 리전에 만들었다.
함수를 같은 iad1에 고정하면 함수↔데이터베이스 왕복이 같은 지역 안에서 끝난다.
사용자↔함수 구간의 태평양 횡단은 요청당 한 번뿐이지만, 함수↔데이터베이스 구간은 요청당 여러 번이므로 곱해지는 쪽을 짧게 만드는 것이 총 지연에 유리하다.
이 콜로케이션(colocation) 전략의 정량적 근거와 Supabase 쪽 설정은 10장에서 자세히 다룬다.

### rewrites — 정적 export에서 동적 경로 흉내 내기

rewrites의 첫 항목(`/api/:path*`)은 앞 절에서 다뤘으니, 나머지 네 항목을 보자.

```json
{ "source": "/decks/:slug", "destination": "/deck" },
{ "source": "/shared/:slug", "destination": "/shared-deck" },
{ "source": "/cards/:id", "destination": "/card" },
{ "source": "/decks/:slug/cards/new", "destination": "/card" }
```

이 규칙들은 정적 export의 근본 제약을 우회하는 장치다.
정적 export는 빌드 시점에 존재하는 페이지만 HTML로 만들 수 있다.
`/decks/ab3f`처럼 런타임에야 정해지는 동적 경로는 미리 만들어 둘 파일이 없으므로, 그대로 요청하면 404가 난다.

5장에서 봤듯 Echo Flip의 해법은 "정적 페이지 하나 + 클라이언트에서 경로 해석"이다.
`/deck`이라는 정적 페이지를 하나 만들어 두고, `/decks/ab3f` 요청을 rewrite로 그 페이지에 매핑한다.
Vercel은 요청 경로에 해당하는 실제 파일이 있으면 그대로 서빙하고, 없을 때 rewrite 규칙을 순서대로 적용하므로 정적 자산과 이 규칙들은 충돌하지 않는다.
그리고 rewrite는 브라우저 주소창의 URL을 바꾸지 않으므로, 페이지의 React 코드가 `window.location.pathname`에서 slug를 읽어낼 수 있다.

`src/app/deck/page.tsx` (slug 해석 부분):

```tsx
// This static page serves /decks/{slug} via rewrites (vercel.json in prod,
// next.config.ts in dev), so the slug only exists in the browser URL:
// undefined until mounted, null when the path carries no slug.
const [slug, setSlug] = useState<string | null | undefined>(undefined);
useEffect(() => {
  setSlug(window.location.pathname.split("/")[2] || null);
}, []);
```

서버는 어느 slug든 같은 HTML을 주고, 어떤 덱을 보여줄지는 브라우저가 URL을 보고 결정한다.
동적 라우팅이 서버에서 클라이언트로 내려온 것이다.

주의할 점이 하나 있다.
`vercel.json`의 rewrite는 Vercel 프로덕션에만 적용되고, 로컬의 `next dev`는 이 파일을 모른다.
그래서 `next.config.ts`가 개발 모드에 한해 동일한 매핑을 중복 정의한다.

`next.config.ts` (개발용 rewrite):

```ts
// Static export ignores rewrites — in production Vercel maps these pretty URLs
// to their static pages (vercel.json); next dev needs the same mapping.
if (process.env.NODE_ENV === "development") {
  nextConfig.rewrites = async () => [
    { source: "/decks/:slug", destination: "/deck" },
    { source: "/shared/:slug", destination: "/shared-deck" },
    { source: "/cards/:id", destination: "/card" },
    { source: "/decks/:slug/cards/new", destination: "/card" },
  ];
}
```

같은 규칙이 두 파일에 존재하는 것은 분명한 중복이고, 새 동적 경로를 추가할 때 한쪽을 빼먹으면 "로컬은 되는데 프로덕션이 404"(또는 그 반대)가 된다.
정적 export를 택한 대가로 감수하는 유지보수 비용이며, 규칙이 네 개 수준이라 아직은 감당할 만하다.
동적 경로가 계속 늘어난다면 규칙을 한 곳에서 생성해 양쪽에 주입하는 스크립트를 두거나, 정적 export 자체를 재검토할 시점이 온 것이다.

### 같은 오리진의 덤 — CORS가 사라진다

한 플랫폼 배포의 부수 효과 하나를 짚고 넘어가자.
정적 프런트와 Go 함수가 같은 도메인에서 서빙되므로, 프로덕션에서 프런트엔드의 API 호출은 같은 오리진(same-origin) 요청, 즉 화면과 API가 같은 주소에서 나오는 요청이 된다.

`src/lib/api.ts`:

```ts
// Same origin in production (Vercel serves /api/* via the Go function);
// point at `go run ./cmd/server` in local dev.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
```

프로덕션에서는 `NEXT_PUBLIC_API_URL`을 아예 설정하지 않아 `BASE`가 빈 문자열이 되고, `/api/decks` 같은 상대 경로 호출이 그대로 같은 오리진으로 나간다.
CORS 프리플라이트(preflight) 요청이 발생하지 않으니 API 호출마다 왕복 하나가 절약되고, 3장에서 본 `pkg/app/app.go`의 CORS 미들웨어는 `ALLOWED_ORIGINS`가 설정된 로컬 개발에서만 활성화된다.
프런트와 API를 다른 플랫폼에 뒀다면 프로덕션에서도 CORS 설정과 프리플라이트 비용을 상시 안고 가야 했을 것이다.

## 콜드스타트 — Go 바이너리라서 감당 가능한 비용

서버리스를 택한 이상 콜드스타트는 피할 수 없다.
문제는 그 크기다.

콜드스타트의 비용은 대략 "런타임 기동 + 애플리케이션 초기화"로 나뉜다.
Go는 이 두 항목 모두에서 유리하다.

첫째, 런타임 기동.
Go 함수는 컴파일된 단일 바이너리다.
인터프리터를 띄우고 수많은 모듈 파일을 로드해야 하는 스크립트 런타임이나, 클래스 로딩과 JIT 워밍업이 필요한 JVM과 달리, 바이너리는 실행 즉시 코드가 돈다.
1장에서 "서버리스에 올릴 것을 염두에 두고 Go를 골랐다"고 한 결정이 여기서 회수된다.

둘째, 애플리케이션 초기화.
`pkg/app`의 `build()`가 하는 일 — 환경 변수 읽기, 커넥션 풀 준비, 라우터 조립 — 은 가볍게 설계되어 있고, `sync.Once` 덕분에 콜드스타트당 한 번만 치른다.
단, 첫 요청에는 초기화 외의 비용도 겹친다.
JWT 검증에 쓸 JWKS(JSON Web Key Set)를 Supabase에서 처음 받아오는 네트워크 왕복과, 커넥션 풀의 첫 데이터베이스 연결 수립이 그것이다.
`DEPLOY.md`의 문제 해결 절도 이를 명시해 두었다.

```text
- **API가 느림(첫 요청)**: 서버리스 콜드스타트 + JWKS 첫 조회. 이후 요청은 빠릅니다.
```

무료 티어에서 감수하기로 한 것들을 정리하면 이렇다.

첫째, 한동안 요청이 없으면 다음 첫 요청이 느리다.
유료 요금제가 제공하는 상시 워밍업 같은 옵션 없이, 콜드스타트를 그대로 맞는다.
하루 몇 번 쓰는 암기 앱에서 첫 요청 한 번의 지연은 수용 가능한 수준이라고 판단했다.

둘째, 요청당 실행 시간 제한이 있다.
Echo Flip의 엔드포인트는 전부 짧은 CRUD라 제한 근처에도 가지 않지만, 이 제한이 있는 한 무거운 작업을 API에 넣을 수 없다는 설계 제약은 상존한다.

셋째, 인스턴스 회수 시점을 제어할 수 없다.
그래서 프로세스 메모리에는 아무런 진실도 두지 않고, 모든 상태를 데이터베이스에 둔다.

이 감수 목록이 길어 보이지만, 반대급부는 "서버 관리 0, 고정 비용 0"이다.
개인 프로젝트에서 이 교환은 남는 장사다.

## 배포 절차 개요 — 구성 요소로 읽는 DEPLOY.md

마지막으로 실제 배포 절차를 훑어보자.
저장소 루트의 `DEPLOY.md`가 전 과정을 담고 있으므로, 여기서는 클릭 순서가 아니라 "무엇이 무엇과 연결되는가"라는 구성 요소 관점으로 요약하겠다.

전체 흐름은 다섯 단계다.

첫째, Supabase 프로젝트를 만든다.
리전은 앞서 말한 대로 East US(North Virginia)로, Vercel 함수의 iad1과 콜로케이션되도록 맞춘다.
여기서 데이터베이스 연결 문자열과 인증 관련 값들이 나온다.

둘째, 데이터베이스 마이그레이션을 실행한다.
`go run ./cmd/migrate`가 6장에서 다룬 스키마를 Supabase의 PostgreSQL에 적용한다.

셋째, OAuth 앱을 등록한다.
Google과 GitHub에 OAuth 애플리케이션을 만들고 자격 증명을 Supabase에 연결한다.
이 인증 흐름의 구조는 10장의 주제다.

넷째, GitHub 저장소를 만들어 push한다.

다섯째, Vercel에서 저장소를 import하고 환경 변수를 등록한다.
Vercel이 Next.js 프로젝트를 자동 감지하므로 빌드 설정은 손댈 것이 없고, 사람이 입력할 것은 환경 변수뿐이다.
`DEPLOY.md`의 표를 옮기면 다음과 같다.

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `NEXT_PUBLIC_API_URL` | (빈 값으로 두거나 아예 만들지 않기 — 같은 오리진) |
| `DATABASE_URL` | Transaction pooler 문자열 (6543) |
| `SUPABASE_JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |

이 표는 그대로 아키텍처 요약이기도 하다.
`NEXT_PUBLIC_` 접두사가 붙은 두 값은 빌드 시점에 정적 프런트엔드에 새겨져 브라우저에서 Supabase 인증에 쓰이고, 나머지 두 값은 Go 함수가 런타임에 읽어 데이터베이스 연결과 JWT 검증에 쓴다.
`NEXT_PUBLIC_API_URL`을 비워 두는 것은 앞 절에서 본 같은 오리진 전략의 표현이다.
`DATABASE_URL`이 왜 직접 연결(5432)이 아니라 트랜잭션 풀러(6543)여야 하는지는 서버리스의 연결 폭증 문제와 얽혀 있는데, 10장에서 자세히 다룬다.

여기까지 마치면 이후의 배포는 전부 자동이다.
`git push origin main` 한 번에 Vercel이 정적 프런트엔드 빌드와 Go 함수 컴파일을 함께 수행하고, 성공하면 원자적으로 새 버전이 서비스된다.
배포 스크립트도, CI 설정 파일도, 서버 접속도 없다.
"관리할 플랫폼 최소화"라는 요구사항이 일상에서 체감되는 순간이다.

## 정리

이 장에서는 Echo Flip의 배포 구성을 요구사항에서 코드까지 따라 내려왔다.

무료·단일 플랫폼·최소 콜드스타트라는 세 요구사항에서 출발해, 처음 검토한 무료 상주 서버(Koyeb 등) 안을 "플랫폼을 하나로 줄일 수 없나"라는 질문으로 뒤집었고, 정적 호스팅과 Go 서버리스 함수를 모두 제공하는 Vercel 하나로 수렴했다.
Netlify·Cloudflare·GitHub Pages·무료 상주 서버 각각이 더 나은 상황도 있음을 확인했다.
웹소켓이나 장시간 작업이 필요하다면, 혹은 콜드스타트를 한 번도 허용할 수 없다면 결론은 달라진다.

구성의 뼈대는 셋이다.
첫째, `next.config.ts`의 `output: "export"`로 프런트엔드를 순수 정적 파일로 만들어 CDN에 얹고, GitHub 연동으로 push마다 자동 배포한다.
둘째, `api/index.go` 하나가 `net/http` 핸들러로 Gin 엔진 전체를 감싸는 catch-all 함수가 되고, `vercel.json`의 `/api/:path*` rewrite가 모든 API 요청을 이 함수로 모은다.
셋째, 나머지 rewrite들이 `/decks/:slug` 같은 동적 경로를 정적 페이지에 매핑해, 정적 export의 한계를 클라이언트 라우팅으로 보완한다.

Vercel Go 런타임이 `api/index.go`를 모듈 외부에서 단독 컴파일한다는 제약은 조립 코드를 `internal`이 아닌 `pkg/app`에 두는 구조적 결정으로 이어졌고, `go build ./...`로는 잡히지 않는 이 위반을 `go build api/index.go`라는 별도 검사로 박제해 go-quality 에이전트의 품질 게이트에 넣었다.
플랫폼의 암묵적 제약을 명시적 검사로 바꿔 두는 것은 AI 에이전트와 협업하는 프로젝트에서 특히 값진 습관이다.

남은 축은 데이터베이스다.
함수 리전을 iad1에 고정한 이유였던 Supabase와의 콜로케이션, 트랜잭션 풀러가 필요한 이유, OAuth와 JWKS 검증의 전체 그림은 다음 장에서 다룬다.
