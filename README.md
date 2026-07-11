# echo-flip 🔊

영어 단어·문장·숙어·개념을 카드로 뒤집으며 외우는 학습 앱.

- **UI**: Go 서버가 렌더링하는 HTML(`html/template`) + [htmx](https://htmx.org) 부분 갱신 + 순수 CSS — 프런트엔드 빌드 도구가 없다
- **백엔드**: Go + Gin — Vercel 서버리스 함수(`api/index.go`) 하나가 페이지·정적 파일·JSON API를 모두 서빙, 로컬은 `cmd/server`
- **DB / 인증**: Supabase (PostgreSQL + Google/GitHub OAuth). OAuth는 서버 사이드 PKCE로 처리하고 세션은 HttpOnly 쿠키 — 브라우저 JS가 토큰을 만질 일이 없다
- **호스팅**: Vercel 무료 티어 하나로 전부 배포. PWA로 웹과 Android 모두 커버
- 남은 자바스크립트는 `internal/web/static/app.js` 하나: 음성(TTS)·클립보드·오프라인 감지·서비스 워커 등록 등 브라우저 전용 API만 감싼다

## 기능

- 양방향 카드(원문 text: 영어·용어 / 뜻 meaning: 설명) + 덱 관리, 태그
- 학습: 방향 선택(원문→뜻 / 뜻→원문) → 카드 뒤집기(CSS만으로 동작) → 스스로 맞음/틀림 판정 → 덱 소화 후 틀린 카드 재도전 라운드
- 간격 반복(SRS, SM-2 변형): 매일 "오늘 복습" 큐 자동 구성
- 규칙 기반 스마트 덱: 오답률 높은 카드·오래 안 본 카드 등을 홈 화면에서 추천
- 학습 통계: 일별 학습량, 정답률, 연속 학습일, 덱별 성취도
- 덱 공유: 공유 링크 + 공유 덱 갤러리에서 미리보고 "내 덱으로 가져오기"(카드 복사, 학습 기록은 새로 시작)
- CSV 가져오기/내보내기 (`text,meaning,type,tags,phonetic,example`, 태그는 `|` 구분; 가져오기는 구 `front,back` 헤더도 인식)
- 무료 사전 API로 발음기호·뜻·예문 자동 채우기 (서버가 조회해 htmx로 폼에 채움)
- 음성(TTS) 버튼: Web Speech API로 영어 읽어주기

## 로컬 개발

```bash
./run_local.sh   # = go run ./cmd/server
```

환경 변수 없이 http://localhost:8080 이 뜬다 (SQLite 로컬 모드, 로그인 없음).
Supabase에 연결하는 운영 구성은 `.env.local.example`과 [DEPLOY.md](./DEPLOY.md) 참고.

## 테스트

```bash
go test ./...   # SRS 알고리즘, 스마트 덱 규칙, CSV 매핑, 사전 응답 매핑, 템플릿
```
