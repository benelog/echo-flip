# echo-flip 🔊

영어 단어·문장·숙어·개념을 카드로 뒤집으며 외우는 학습 앱.

- **프론트엔드**: Next.js (App Router, 정적 export) + Tailwind CSS + TanStack Query — PWA로 웹과 Android 모두 커버
- **백엔드**: Go + Gin — Vercel 서버리스 함수(`api/index.go`)로 배포, 로컬은 `cmd/server`
- **DB / 인증**: Supabase (PostgreSQL + Google/GitHub OAuth), 데이터 접근은 Go API 전용
- **호스팅**: Vercel 무료 티어 하나로 정적 프론트 + Go API 함수 모두 배포

## 기능

- 양방향 카드(원문 text: 영어·용어 / 뜻 meaning: 설명) + 덱 관리, 태그
- 학습: 방향 선택(원문→뜻 / 뜻→원문) → 카드 뒤집기 → 스스로 맞음/틀림 판정 → 덱 소화 후 틀린 카드 재도전 라운드
- 간격 반복(SRS, SM-2 변형): 매일 "오늘 복습" 큐 자동 구성
- 규칙 기반 스마트 덱: 오답률 높은 카드·오래 안 본 카드 등을 홈 화면에서 추천
- 학습 통계: 일별 학습량, 정답률, 연속 학습일, 덱별 성취도
- 덱 공유: 공유 링크 + 공유 덱 갤러리에서 미리보고 "내 덱으로 가져오기"(카드 복사, 학습 기록은 새로 시작)
- CSV 가져오기/내보내기 (`text,meaning,type,tags,phonetic,example`, 태그는 `|` 구분; 가져오기는 구 `front,back` 헤더도 인식)
- 무료 사전 API로 발음기호·뜻·예문 자동 채우기
- 음성(TTS) 버튼: Web Speech API로 영어 읽어주기

## 로컬 개발

```bash
# 0) .env.local.example를 참고해 .env.local 작성 + 셸에 Go용 env export

# 1) DB 마이그레이션 (Supabase 프로젝트 생성 후 1회)
MIGRATE_DATABASE_URL='<direct 연결 문자열>' go run ./cmd/migrate

# 2) Go API (http://localhost:8080)
DATABASE_URL='...' SUPABASE_JWKS_URL='...' ALLOWED_ORIGINS=http://localhost:3000 \
  go run ./cmd/server

# 3) 웹 (http://localhost:3000)
npm run dev
```

## 테스트

```bash
go test ./...   # SRS 알고리즘, 스마트 덱 규칙
npm test        # CSV 매핑, 사전 응답 매핑
```

배포 절차는 [DEPLOY.md](./DEPLOY.md) 참고.
