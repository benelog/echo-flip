// 부록 B(배포 준비) 대시보드 캡처 스크립트.
// 앱 화면 캡처(capture-screenshots.mjs)와 같은 방식이다: 별도 프로필 Chrome에 직접 로그인해 두고,
// CDP로 연결해 각 대시보드 화면을 찍는다. 대시보드는 데스크톱 화면이라 가로가 넓다.
//
// 사용 절차:
//   1. 세 대시보드에 쓸 별도 프로필 Chrome을 디버깅 포트와 함께 띄운다:
//        google-chrome --user-data-dir=/tmp/fc-dash-profile --remote-debugging-port=9222 \
//          --no-first-run --no-default-browser-check https://supabase.com/dashboard
//   2. 그 창에서 Supabase, Google Cloud Console, Vercel에 각각 로그인해 둔다.
//   3. doc/ 에서 실행: node scripts/capture-dashboards.mjs
//      원본이 OUT_DIR(기본 /tmp/fc-dash-raw)에 저장된다.
//   4. 축소(ImageMagick) 후 doc/public/screenshots/ 의 자리표시 이미지를 교체한다:
//        for f in dash-providers dash-google-client dash-url-config \
//                 dash-vercel-environments dash-vercel-envvars; do
//          convert /tmp/fc-dash-raw/$f.png -resize 1400x -strip public/screenshots/$f.png
//        done
//   5. 촬영 후 임시 프로필을 지운다(로그인 쿠키 포함): rm -rf /tmp/fc-dash-profile
//
// 주의: 이 책은 저자 본인의 프로젝트 식별자(Supabase project ref, Google client ID, Vercel slug 등)를
//       화면에 그대로 싣기로 했다. 앱 캡처와 달리 별도 마스킹은 하지 않는다.
//       민감한 값(연결 문자열, anon key, client secret)이 보이는 화면은 찍지 않는다.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = process.env.OUT_DIR ?? '/tmp/fc-dash-raw';

// 저자 프로젝트 기준 URL. 다른 프로젝트에서 재사용할 때만 환경 변수로 덮어쓴다.
const SUPABASE_PROJECT = process.env.SUPABASE_PROJECT ?? 'aueafzjlmqdtcfrkctzx'; // 개발 프로젝트
const GOOGLE_PROJECT = process.env.GOOGLE_PROJECT ?? 'flashcard-dev-502421';
const GOOGLE_CLIENT =
  process.env.GOOGLE_CLIENT ??
  '596602515668-6lq1oqvn79knor4tbe3v5i631j8908st.apps.googleusercontent.com';
const VERCEL_PROJECT = process.env.VERCEL_PROJECT ?? 'sanghyuk-jungs-projects/flashcard';

const SHOTS = [
  {
    name: 'dash-providers',
    url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/auth/providers`,
    // "Auth Providers" 목록이 보이도록 아래로 조금 스크롤한다.
    scrollTo: 'Auth Providers',
  },
  {
    name: 'dash-google-client',
    url: `https://console.cloud.google.com/auth/clients/${GOOGLE_CLIENT}?project=${GOOGLE_PROJECT}`,
    scrollTo: '승인된 리디렉션 URI',
  },
  {
    name: 'dash-url-config',
    url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/auth/url-configuration`,
    scrollTo: 'Redirect URLs',
  },
  {
    name: 'dash-vercel-environments',
    url: `https://vercel.com/${VERCEL_PROJECT}/settings/environments`,
  },
  {
    name: 'dash-vercel-envvars',
    url: `https://vercel.com/${VERCEL_PROJECT}/settings/environments/production`,
    scrollTo: 'Environment Variables',
  },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

for (const s of SHOTS) {
  await page.goto(s.url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  if (s.scrollTo) {
    await page
      .evaluate((text) => {
        const el = [...document.querySelectorAll('h1,h2,h3,h4,div,span')].find((n) =>
          n.textContent?.trim().startsWith(text),
        );
        el?.scrollIntoView({ block: 'center' });
      }, s.scrollTo)
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
  }
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('captured', s.name);
}

await page.close();
browser.disconnect();
console.log('done. 이제 ImageMagick으로 축소해 public/screenshots/ 에 교체한다(스크립트 머리 주석 참고).');
