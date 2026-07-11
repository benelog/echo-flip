/* echo-flip service worker.
   페이지 HTML은 서버가 그때그때 렌더링하므로 network-first(오프라인일 때만
   캐시 사용), 정적 자원은 stale-while-revalidate, API는 network only. */
const CACHE = "echo-flip-v2";

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
