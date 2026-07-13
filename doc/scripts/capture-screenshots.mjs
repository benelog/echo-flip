// 책 그림 1~4 재촬영 스크립트 (CLAUDE.md "화면 캡처" 절의 조건을 자동화)
//
// 사용 절차:
//   1. 별도 프로필 Chrome을 디버깅 포트와 함께 띄운다(기본 프로필은 Chrome 136+에서 포트가 막힌다):
//        google-chrome --user-data-dir=/tmp/fc-capture-profile --remote-debugging-port=9222 \
//          --no-first-run --no-default-browser-check https://flashcard-delta.vercel.app/login
//   2. 그 창에서 직접 로그인한다(스크립트가 로그인될 때까지 최대 60분 대기).
//   3. doc/ 에서 실행: node scripts/capture-screenshots.mjs
//      원본 7장이 OUT_DIR(기본 /tmp/fc-capture-raw)에 1290×2580으로 저장된다.
//   4. 합성·축소(ImageMagick) 후 doc/public/screenshots/ 에 교체한다:
//        convert home.png -resize 700x1400 -strip .../home.png
//        convert deck.png -resize 700x1400 -strip .../deck-cards.png
//        convert \( study-direction.png -resize 600x1200 \) \( study-front.png -resize 600x1200 \) \
//          \( study-back.png -resize 600x1200 \) +append -strip .../study-flow.png
//        convert \( stats.png -resize 650x1300 \) \( shared.png -resize 650x1300 \) +append -strip .../stats-shared.png
//   5. 촬영 후 임시 프로필을 지운다(세션 쿠키 포함): rm -rf /tmp/fc-capture-profile
//
// 주의: 채점 버튼은 누르지 않으므로 SRS 학습 데이터는 바뀌지 않는다. 이메일은 you@example.com으로 치환된다.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.CAPTURE_BASE ?? 'https://flashcard-delta.vercel.app';
const OUT = process.env.OUT_DIR ?? '/tmp/fc-capture-raw';
const DECK_SLUG = process.env.DECK_SLUG ?? '38nn'; // "TOEIC 필수 단어" 데모 덱

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

// 로그인 대기: 홈에 로그아웃 버튼이 보일 때까지 10초 간격으로 확인
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 860, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

let loggedIn = false;
for (let i = 0; i < 360; i++) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  loggedIn = await page.evaluate(() => document.body.innerText.includes('로그아웃')).catch(() => false);
  if (loggedIn) break;
  console.log('로그인 대기 중...');
  await new Promise(r => setTimeout(r, 10000));
}
if (!loggedIn) {
  console.error('로그인 타임아웃(60분)');
  process.exit(1);
}
console.log('로그인 확인됨');

async function sanitize() {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue.includes('@')) {
        n.nodeValue = n.nodeValue.replace(/\S+@\S+\.\S+/g, 'you@example.com');
      }
    }
  });
}

async function shot(name) {
  await sanitize();
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('captured', name);
}

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 500));
}

// 1) 홈
await goto('/');
await shot('home');

// 2) 덱 상세 + 학습 URL(deckId) 확보
await goto('/decks/' + DECK_SLUG);
await shot('deck');
const studyUrl = await page.evaluate(() => {
  const a = document.querySelector('a[href^="/study"]');
  return a ? a.getAttribute('href') : null;
});
if (!studyUrl) {
  console.error('학습 링크를 찾지 못함');
  process.exit(1);
}
console.log('study url:', studyUrl);

// 3) 학습 3단계: 방향 선택 → 카드 앞면 → 뒷면(채점 버튼은 누르지 않는다)
await goto(studyUrl);
await shot('study-direction');

const sep = studyUrl.includes('?') ? '&' : '?';
await goto(studyUrl + sep + 'direction=text_to_meaning');
await page.waitForSelector('#reveal', { timeout: 10000 });
await shot('study-front');

await page.evaluate(() => { document.getElementById('reveal').checked = true; });
await shot('study-back');

// 세션 정리(채점 없이 종료)
await page.evaluate(async () => {
  await fetch('/study/quit', { method: 'POST' }).catch(() => {});
});

// 4) 통계, 공유 덱
await goto('/stats');
await shot('stats');
await goto('/shared');
await shot('shared');

await page.close();
browser.disconnect();
console.log('done');
