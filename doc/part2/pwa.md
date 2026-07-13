# 19장 PWA: 설치되는 앱으로 만들기

16장에서 앱을 Vercel에 올렸고, 17장과 18장에서 인증과 데이터베이스를 붙였다.
이제 주소만 있으면 누구나 브라우저로 Flashcard를 쓸 수 있다.

그런데 암기 앱은 하루에 몇 번씩 짧게 여는 앱이다.
그때마다 브라우저를 켜고 주소창에 무언가를 입력해야 한다면, 아무리 좋은 간격 반복 알고리즘도 열리지 않는 앱 안에서 잠들어 있을 뿐이다.
도입에서 "네이티브 앱 대신 PWA로 웹과 Android를 함께 커버한다"는 요구사항을 세운 이유가 여기에 있다.

이 장에서는 배포된 웹 앱을 홈 화면에 설치되는 앱으로 만드는 두 파일, `internal/web/static/`의 `manifest.webmanifest`와 `sw.js`를 읽는다.
각 필드와 각 캐시 전략이 실제 설치 경험과 어떻게 이어지는지에 무게를 두고, 자바스크립트를 거의 걷어 낸 이 앱에서 서비스 워커가 왜 자바스크립트를 요구하는 대표적인 곳인지도 짚는다.
그리고 이 앱이 PWA로서 무엇을 포기했는지, 그 포기가 왜 이 앱에서는 합리적인지도 함께 적는다.

## 설치되는 앱의 조건

브라우저가 "이 사이트를 앱으로 설치하시겠습니까"라고 물어보게 하려면 대체로 세 가지가 필요하다.

첫째, HTTPS로 서빙되어야 한다.
서빙(serving)은 서버가 요청을 받아 화면이나 파일을 내주는 일이고, HTTPS는 그 내용을 암호로 감싸서 주고받는 통신 방식이다(16장).
브라우저는 서비스 워커처럼 요청을 가로챌 수 있는 기능을 암호화되지 않은 연결에는 내주지 않는다.
16장에서 봤듯 HTTPS에 필요한 인증서를 Vercel이 자동으로 발급하고 갱신하므로 이 조건은 저절로 충족된다.

둘째, 웹 앱 매니페스트가 있어야 한다.
앱의 이름, 아이콘, 실행 방식을 브라우저에게 알려 주는 파일이다.

::: info [용어 풀이] 웹 앱 매니페스트(Web App Manifest)
웹사이트가 "나를 앱으로 설치하면 이런 모습이 된다"고 브라우저에 알려 주는 JSON 문서다.
앱 이름, 아이콘, 시작 주소, 주소창을 숨길지 같은 설치 정보가 들어 있고, HTML의 `<link rel="manifest">`로 페이지에 연결한다.
가게 입구에 붙여 둔 간판과 영업 안내문인 셈이다.
:::

셋째, 서비스 워커가 등록되어 있어야 한다.
브라우저마다 조건이 조금씩 다르지만, 설치 가능 여부를 판단할 때 서비스 워커의 존재를 요구하는 경우가 많다.

::: info [용어 풀이] 서비스 워커(Service Worker)
웹 페이지와 별개로 브라우저 뒤편에서 도는 작은 스크립트다.
페이지가 보내는 네트워크 요청 사이에 끼어 앉아, 요청을 가로채서 캐시에 있는 응답을 대신 내주거나 네트워크로 흘려보내는 일을 한다.
가게 앞에 선 안내원이 손님의 주문을 받아 창고에 있으면 바로 꺼내 주고 없으면 본사에 주문을 넣는 모습에 가깝다.
페이지를 닫아도 살아 있을 수 있어서 오프라인 동작과 푸시 알림의 토대가 된다.
:::

Flashcard는 앞의 두 조건을 `manifest.webmanifest`로, 마지막 조건을 `sw.js`로 충족한다.
두 파일 모두 `internal/web/static/`에 있는 평범한 정적 파일이고, 11장에서 본 embed로 Go 바이너리에 담겨 다른 정적 자산과 같은 경로로 서빙된다.

## manifest.webmanifest: 설치 화면을 결정하는 파일

`internal/web/static/manifest.webmanifest`의 전문이다.

```json
{
  "name": "Flashcard — 암기 카드",
  "short_name": "Flashcard",
  "description": "단어·문장·숙어·개념을 카드로 뒤집으며 외우는 학습 앱",
  "lang": "ko",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

만들어 내는 코드도, 빌드 단계도 없다.
손으로 쓴 JSON 파일 하나가 그대로 서빙된다.
브라우저가 이 파일을 찾을 수 있도록 모든 페이지의 공통 레이아웃이 `<head>`에서 연결해 준다.

`internal/web/templates/layout.html` (발췌):

```html
<link rel="manifest" href="/manifest.webmanifest">
```

필드를 하나씩 보자.

`name`과 `short_name`은 쓰이는 자리가 다르다.
설치 대화상자에는 `name`이, 홈 화면 아이콘 아래의 좁은 자리에는 `short_name`이 나타난다.
아이콘 아래에서 줄바꿈되거나 말줄임표로 잘리는 것을 막으려면 `short_name`을 짧게 두어야 한다.

`display: "standalone"`이 설치의 체감을 가장 크게 바꾼다.
이 값을 주면 앱을 열었을 때 주소창과 브라우저 탭이 사라지고, 사용자에게는 네이티브 앱처럼 보인다.
반대로 `browser`로 두면 설치해 봐야 그냥 브라우저 창이 하나 더 열릴 뿐이다.

`start_url: "/"`은 아이콘을 눌렀을 때 열리는 주소다.
`/`로 두었으므로 언제나 홈 화면의 "오늘 복습" 큐에서 시작한다.
사용자가 마지막으로 보던 화면이 아니라 매번 같은 자리에서 시작하는 것이 암기 앱에는 오히려 낫다.

`background_color`와 `theme_color`는 색이지만 하는 일이 다르다.
`background_color`는 앱이 뜨는 동안 잠깐 보이는 시작 화면의 바탕색이고, `theme_color`는 상태 표시줄처럼 브라우저가 앱 주변을 칠할 때 쓰는 색이다.
`background_color`를 실제 앱 배경과 맞춰 두면 시작 화면에서 본 화면으로 넘어갈 때 깜빡임이 줄어든다.

### 아이콘 세 개와 maskable

아이콘이 세 개인 데는 이유가 있다.

192px와 512px는 쓰이는 자리가 다르다.
192px는 홈 화면에 놓이는 아이콘 자리에, 512px는 앱이 뜨는 동안 잠깐 보이는 시작 화면의 큰 아이콘 자리에 쓰인다.
Chrome은 이 두 크기를 설치 조건으로 요구하고, 다른 크기가 필요한 자리에는 둘 중 가까운 쪽을 늘리거나 줄여 쓴다.
그런데 세 번째 아이콘만 `purpose: "maskable"`을 달고 있다.

Android는 제조사와 런처에 따라 아이콘을 원형, 둥근 사각형, 물방울 모양 등으로 잘라 낸다.
일반 아이콘을 그대로 잘라 내면 가장자리의 글자나 그림이 함께 잘려 나간다.
maskable 아이콘은 그 잘림을 예상하고 여백을 넉넉히 둔 그림이다.
가운데 80% 안에만 중요한 내용을 그려 두면 어떤 모양으로 잘려도 살아남는다.

일반 아이콘과 maskable 아이콘을 둘 다 제공하고 브라우저가 상황에 맞게 고르게 하는 것이 안전하다.
`internal/web/static/icons/` 아래에 `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` 세 파일이 그래서 함께 있다.

## sw.js: 무엇을 캐시하고 무엇을 캐시하지 않는가

`internal/web/static/sw.js`의 전문이다.
직접 쓴 쉰 줄 남짓한 파일이고, Workbox 같은 라이브러리를 쓰지 않았다.
어떤 요청을 캐시하고 어떤 요청은 캐시하지 않을지 정하는 규칙 전부가 이 안에 있다.
지금 이 전문을 다 읽을 필요는 없다.
아래에서 세 갈래로 나눠 한 조각씩 다시 꺼내 볼 것이고, 지금은 "요청의 종류에 따라 세 가지 다른 처리를 한다"는 것만 보면 된다.

```js
/* flashcard service worker.
   페이지 HTML은 서버가 그때그때 렌더링하므로 network-first(오프라인일 때만
   캐시 사용), 정적 자원은 stale-while-revalidate, API는 network only. */
const CACHE = "flashcard-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isData =
    url.pathname.startsWith("/api/") || url.origin !== self.location.origin;
  if (event.request.method !== "GET" || isData) return; // network only

  // 서버 렌더링 페이지: 항상 네트워크 우선, 오프라인일 때만 마지막 사본.
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          const cached = await cache.match(event.request);
          return cached || Response.error();
        }
      }),
    );
    return;
  }

  // 정적 자원: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
```

맨 위 주석이 이 파일의 요약이다.
요청을 데이터(API), 페이지 HTML, 정적 자원의 세 갈래로 나누고, 갈래마다 다른 캐시 전략을 쓴다.
왜 세 갈래인지가 이 절의 이야기다.

::: info [용어 풀이] 캐시 전략(Caching Strategy)
같은 요청에 대해 캐시에 있는 사본과 네트워크의 최신 응답 중 무엇을 먼저 쓸지 미리 정해 둔 규칙이다.
network-first는 네트워크를 먼저 시도하고 실패했을 때만 사본을 꺼내는 방식, cache-first는 사본이 있으면 네트워크에 아예 묻지 않는 방식, stale-while-revalidate는 낡은(stale) 사본을 즉시 돌려주는 동안(while) 뒤에서 새 응답을 받아 캐시를 갱신(revalidate)하는 방식이다.
network only는 캐시를 건드리지 않고 언제나 네트워크로 나간다.
무엇을 고를지는 그 응답이 낡았을 때 사용자가 무엇을 손해 보는지에 달렸다.
빨리 보여 주는 값과 정확하게 보여 주는 값 중 어느 쪽이 큰지를 요청의 종류마다 따로 답한 것이 캐시 전략이다.
:::

서비스 워커는 세 가지 생애 사건, 곧 설치(`install`), 활성화(`activate`), 요청 가로채기(`fetch`)에 반응한다.

`install`에서 `skipWaiting()`을 부른다.
기본 동작대로라면 새 서비스 워커는 이전 버전을 쓰는 탭이 전부 닫힐 때까지 대기실에서 기다린다.
`skipWaiting()`은 그 대기를 건너뛰고 즉시 활성화한다.

`activate`에서는 두 가지 일을 한다.
`CACHE` 상수와 이름이 다른 옛 캐시를 전부 지우고, `clients.claim()`으로 이미 열려 있는 탭까지 새 서비스 워커의 통제 아래로 데려온다.
`skipWaiting`과 `clients.claim`이 짝을 이루어야 배포 직후에 새 버전이 곧바로 적용된다.

`fetch`가 핵심이다.
가장 먼저 하는 일이 캐시하지 않을 요청을 걸러 내는 것이다.

```js
const isData =
  url.pathname.startsWith("/api/") || url.origin !== self.location.origin;
if (event.request.method !== "GET" || isData) return; // network only
```

`return`은 "내가 처리하지 않겠다"는 뜻이고, 그러면 요청은 평소대로 네트워크로 나간다.
GET이 아닌 요청, `/api/`로 시작하는 요청, 다른 오리진(이 앱이 아닌 다른 사이트)으로 나가는 요청이 여기에 걸린다.
htmx가 보내는 채점·저장 같은 POST 요청도 GET이 아니므로 전부 이 갈래다.

이것이 학습 앱에서 반드시 그래야 하는 선택이다.
`/api/` 응답을 캐시하면 "오늘 복습할 카드" 목록이 낡는다.
어제 다 외운 카드가 오늘도 큐에 남아 있거나, 방금 추가한 카드가 목록에 나타나지 않는다.
간격 반복은 서버가 계산한 최신 상태가 곧 앱의 가치인 기능이라, 여기서 낡은 데이터를 보여 주는 것은 앱이 조금 느린 것보다 훨씬 나쁘다.
그래서 데이터는 무조건 네트워크다.

### 페이지 HTML도 데이터다: navigate는 network-first

그런데 이 앱에서 걸러 내야 할 "데이터"는 `/api/` 경로가 전부가 아니다.
11장에서 봤듯 페이지 HTML은 서버가 요청 시점에 렌더링하고, 홈 화면의 복습 큐도 통계 화면의 숫자도 HTML 안에 이미 들어 있다.
페이지가 곧 데이터다.
페이지 응답을 캐시에서 먼저 돌려주면 API를 캐시했을 때와 똑같은 문제가 생긴다.
방금 카드를 추가하고 홈으로 돌아왔는데 캐시된 어제의 목록이 보이는 식이다.

그래서 주소를 입력하거나 링크를 눌러 페이지를 여는 요청(`event.request.mode === "navigate"`)은 network-first로 처리한다.

```js
if (event.request.mode === "navigate") {
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      } catch {
        const cached = await cache.match(event.request);
        return cached || Response.error();
      }
    }),
  );
  return;
}
```

항상 네트워크를 먼저 시도하고, 성공한 응답은 사본을 캐시에 남긴다.
캐시를 읽는 것은 `fetch`가 예외를 던졌을 때, 즉 오프라인일 때뿐이다.
그때는 마지막으로 본 그 페이지의 사본이 뜨고, 사본조차 없으면 `Response.error()`로 평범한 네트워크 실패가 된다.
온라인일 때는 캐시가 화면에 아무 영향을 주지 않으므로 낡은 목록이 보일 일이 없고, 오프라인일 때만 "아무것도 안 뜨는 것보다는 어제의 화면"이라는 차선을 취한다.

### 정적 자원: 일단 캐시로 보여 주고 뒤에서 갱신한다(stale-while-revalidate)

마지막 갈래는 두 필터를 다 통과한 요청, 즉 `app.css`와 `htmx.min.js`, 아이콘 같은 정적 파일이다.
여기에는 stale-while-revalidate를 쓴다.

```js
const cached = await cache.match(event.request);
const network = fetch(event.request)
  .then((res) => {
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  })
  .catch(() => cached);
return cached || network;
```

캐시에 있으면 그것을 즉시 돌려주고, 없으면 네트워크 응답을 기다린다.
어느 쪽이든 네트워크 요청은 함께 날아가서 성공하면 캐시를 갱신한다.
스타일과 스크립트는 어제의 사본을 써도 화면이 틀려지지 않으므로, 페이지와 달리 즉시성보다 속도를 택했다.
16장에서 본 것처럼 정적 자산은 함수까지 가야 나오는데, 이 캐시 덕에 재방문에서는 그 왕복 자체가 사라진다.

`cache.put`에 `res.clone()`을 넘기는 것도 그냥 지나칠 대목이 아니다.
응답 본문은 한 번만 읽을 수 있는 흐름이라, 캐시에 넣으면서 동시에 페이지에 돌려주려면 복제본이 필요하다.

## 등록은 한 줄: 자바스크립트가 필요한 자리

서비스 워커는 저절로 켜지지 않는다.
12장에서 해부한 `app.js`, 곧 이 앱에 남은 유일한 자바스크립트 파일의 한 대목이 등록을 맡는다.

`internal/web/static/app.js` (발췌):

```js
// PWA: 서비스 워커 등록 (localhost 포함, http에서는 브라우저가 거부한다).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
```

이 앱은 화면 갱신을 HTML과 htmx에 맡겨 자바스크립트를 거의 걷어 냈지만, 서비스 워커만은 자바스크립트 없이 켤 방법이 없다.
음성 합성이나 클립보드처럼 브라우저에서만 접근할 수 있는 Web API의 하나이기 때문이다.
12장에서 "그래도 남는 자바스크립트"의 목록에 서비스 워커 등록이 들어 있던 이유가 이것이다.

조건은 `"serviceWorker" in navigator` 하나로, 지원하지 않는 브라우저를 걸러 낸다.
개발 환경과 운영 환경을 구분하는 분기는 없다.
브라우저 자체가 HTTPS에서만 서비스 워커를 허용하고 예외는 localhost뿐이라, 13장의 로컬 서버(`localhost:8080`)에서는 등록되고 그 밖의 평문 HTTP에서는 브라우저가 알아서 거부한다.
로컬에서도 켜 두는 것은 의도적이다.
페이지가 network-first라 코드를 고치고 새로고침하면 바로 반영되므로, 캐시가 개발을 방해하는 일이 크게 줄었다.
그래도 CSS 같은 정적 자원은 stale-while-revalidate 탓에 새로고침 한 번 늦게 보일 수 있다.
개발자 도구(DevTools)의 Application 탭에서 "Update on reload"를 켜 두면 이 어긋남도 사라진다.

::: info [용어 풀이] 개발자 도구(DevTools)
브라우저에 내장된 점검 창이다.
지금 열려 있는 페이지의 HTML과 CSS, 오간 네트워크 요청, 브라우저에 저장된 캐시와 서비스 워커를 들여다보고 그 자리에서 바꿔 볼 수도 있다.
Chrome에서는 F12를 누르거나(macOS는 ⌥⌘I), 화면에서 오른쪽 클릭 후 "검사"를 고르면 열린다.
화면에 나온 결과만으로는 원인을 알 수 없을 때 자동차의 보닛을 열어 엔진을 확인하는 일에 해당하고, 이 장에서 설치와 캐시를 확인하는 절차도 전부 이 창에서 이루어진다.
:::

`.catch(() => {})`로 실패를 삼키는 것도 의도적이다.
서비스 워커 등록에 실패해도 앱은 그냥 캐시 없이 동작할 뿐이므로, 사용자에게 보여 줄 오류가 아니다.

## 손으로 올리는 캐시 버전

`const CACHE = "flashcard-v2"` 한 줄에, 빌드 도구 없이 정적 파일을 그대로 서빙하는 이 구조의 약점이 숨어 있다.

이 앱의 정적 파일은 `app.css`, `app.js`처럼 이름이 고정되어 있다.
빌드 도구가 파일 이름에 내용 해시를 붙여 주는 구성이라면 내용이 바뀔 때 이름도 바뀌어 캐시에 없는 새 요청이 되지만, 여기서는 이름이 그대로라 캐시가 옛 사본을 계속 돌려준다.
stale-while-revalidate가 뒤에서 갱신해 주므로 새 파일은 그다음 방문에 반영되고, 16장에서 본 한 시간짜리 `Cache-Control`까지 더해지면 스타일 변경이 최대 한 시간과 방문 한 번만큼 늦게 보일 수 있다.
페이지 HTML은 network-first라 내용이 늦는 일은 없고, 껍데기의 단장이 잠시 늦는 것은 감수하기로 한 비용이다.

그보다 까다로운 순간은 캐시 전략 자체를 바꿀 때다.
`sw.js`를 고쳤다면 `CACHE` 값을 올려야 `activate` 훅이 옛 캐시를 통째로 지우고 새 정책으로 다시 시작한다.
이 파일의 캐시 이름이 v1이 아니라 v2인 것이 바로 그 버전을 한 번 올린 흔적이다.
버전을 올리지 않고 전략만 바꾸면, 사용자의 기기에는 옛 정책으로 캐시된 파일이 남는다.

버전 올리기가 사람이 잊지 않아야 하는 수동 단계라는 점을 인정하고 넘어가는 편이 정직하다.
Workbox 같은 라이브러리는 빌드 시점에 캐시 이름과 목록을 자동으로 생성해 이 문제를 없애 준다.
그러나 그 자동화에는 프런트엔드 빌드 파이프라인이 필요하다.
빌드 없이 정적 파일 몇 개로 완결되는 지금 구조에서, 캐시 전략을 거의 바꾸지 않는 앱을 위해 빌드 단계를 들여오는 것은 배보다 배꼽이 크다.

## 설치를 확인하는 법

만들었으면 확인해야 한다.

Chrome의 개발자 도구에는 Application 탭이 있다.
Manifest 항목을 열면 브라우저가 해석한 매니페스트가 필드별로 보이고, 아이콘이 실제로 불러와지는지도 확인할 수 있다.
Service Workers 항목에서는 등록 상태와 활성화 여부를 볼 수 있고, Offline 체크박스로 네트워크를 끊어 볼 수도 있다.

여기서 이 앱의 정직한 모습이 드러난다.
Offline을 켜고 새로고침하면 마지막으로 본 페이지의 사본이 뜨고, 상단에 오프라인 배너가 나타난다(`app.js`가 `navigator.onLine`을 보고 띄운다).
사본 속 목록은 오프라인이 되기 전의 것이고, 학습 채점 같은 폼 전송은 네트워크 전용이라 실패한다.
읽던 화면은 남겨 주되 새 학습은 막는 것, 그것이 이 서비스 워커가 오프라인에 대해 약속하는 전부다.

Android의 Chrome에서는 조건을 만족하면 주소창에 설치 아이콘이 나타나거나 설치 안내가 뜬다.
iOS의 Safari에는 자동 설치 안내가 없어서, 사용자가 공유 메뉴에서 "홈 화면에 추가"를 직접 눌러야 한다.
매니페스트의 `display: "standalone"`은 그렇게 추가된 아이콘에도 적용되므로, 설치 경로만 다르고 결과는 비슷하다.

## 이 PWA가 포기한 것

Flashcard는 PWA의 일부만 쓴다.
무엇을 안 썼는지 적어 두는 편이 정확하다.

**오프라인 학습을 지원하지 않는다.**
지하철에서 앱을 열면 마지막으로 본 화면의 사본이 뜰 뿐, 카드를 뒤집으며 채점을 진행할 수는 없다.
지원하려면 카드 데이터를 브라우저 안의 저장소(IndexedDB)에 미리 내려 두고, 오프라인에서 매긴 학습 결과를 나중에 서버와 동기화해야 한다.
동기화에는 충돌 해결이 따라온다.
같은 카드를 두 기기에서 다르게 채점했을 때 어느 SRS 상태가 옳은가라는 질문에 답해야 하는데, 이는 앱 전체에서 가장 복잡한 코드가 될 것이 분명했다.
매일 쓰는 기기가 하나뿐인 개인 앱에서는 그 복잡도를 살 이유가 없었다.

**푸시 알림이 없다.**
암기 앱에 "오늘 복습할 카드 12장이 있습니다" 알림만큼 어울리는 기능도 드물다.
그런데 웹 푸시를 보내려면 알림을 발송하는 서버가 필요하고, 그 서버는 사용자의 복습 시각을 알기 위해 주기적으로 깨어나야 한다.
요청이 있을 때만 깨어나는 서버리스 함수와는 결이 다른 요구다.
20장에서 볼 스케줄 워크플로로 흉내 낼 수는 있지만, 사용자별 시간대와 알림 시각을 관리하는 순간 이 앱은 다른 앱이 된다.

**백그라운드 동기화도 없다.**
오프라인 학습이 없으므로 나중에 보낼 것도 없다.

이 세 가지는 서로 이어져 있다.
오프라인 학습을 하기로 하면 동기화가 필요하고, 알림을 보내기로 하면 상주하는 무언가가 필요하다.
어느 쪽도 "무료 인프라, 서버리스, 1인 운영"이라는 제약과 편하게 어울리지 않는다.
PWA를 고른 이유가 네이티브 앱의 배포 부담을 피하는 것이었지, 네이티브 앱의 모든 기능을 웹으로 재현하는 것은 아니었다.

## 에이전트 활용 아이디어

서비스 워커는 코드가 쉰 줄이어도, 실수의 결과가 사용자 브라우저에 캐시로 남는 층이다.

CLAUDE.md에는 "sw.js의 캐시 전략을 바꾸면 반드시 CACHE 버전을 올린다", "/api/ 응답과 GET이 아닌 요청은 캐시하지 않는다"를 적는다.
버전 올리기는 이 장에서 본 대로 잊기 쉽고, 잊으면 옛 정책이 사용자 기기에 남는 종류의 실수라 지침 가치가 크다.

캐시 전략을 바꾸는 작업은 확인 시나리오까지 지시문에 담는다.
"배포 후 첫 방문, 재방문, 오프라인 세 경우에 각 요청이 네트워크와 캐시 중 어디서 오는지 표로 예측해 달라"고 하면, 코드보다 먼저 전략의 구멍이 드러난다.
매니페스트나 아이콘처럼 눈으로 확인할 것들은 10장의 화면 검증 요령을 그대로 쓴다.

## 정리

첫째, 설치되는 앱의 조건은 HTTPS, 매니페스트, 서비스 워커 세 가지다.
HTTPS는 Vercel이 해결해 주므로 저장소에는 `manifest.webmanifest`와 `sw.js` 두 파일만 있으면 되고, 둘 다 `internal/web/static/`의 평범한 정적 파일이다.

둘째, 매니페스트에서는 `display: "standalone"`이 설치의 체감을 결정하고, `short_name`은 아이콘 아래의 좁은 자리를 위해 따로 존재한다.
maskable 아이콘은 Android 런처가 아이콘을 임의의 모양으로 잘라 내는 것에 대비한 별도 이미지로, 일반 아이콘과 함께 제공해 브라우저가 고르게 한다.

셋째, `sw.js`는 요청을 세 갈래로 나눈다.
API와 폼 전송은 네트워크 전용이다.
간격 반복 앱에서 낡은 데이터는 느린 앱보다 나쁘기 때문이다.
서버가 렌더링하는 페이지 HTML은 그 자체가 데이터이므로 network-first로 두고 오프라인일 때만 마지막 사본을 꺼내며, 정적 자원만 stale-while-revalidate로 속도를 챙긴다.

넷째, 서비스 워커 등록은 `app.js`의 몫이다.
화면 갱신을 HTML과 htmx에 맡긴 이 앱에서도 서비스 워커만은 자바스크립트를 요구하는, 브라우저 전용 Web API의 대표적인 자리다.

다섯째, 이 앱은 오프라인 학습과 푸시 알림을 포기했다.
둘 다 동기화나 상주 서버를 데려오는 기능이라, 이 책의 제약과 정면으로 부딪힌다.

앱이 설치까지 됐으니 남은 것은 오래 굴리는 일이다.
다음 20장에서는 이 모든 것을 떠받치는 무료 티어의 한도를 정면으로 들여다본다.
무엇이 가장 먼저 터지는지 계산해 보면 뜻밖의 답이 나온다.
