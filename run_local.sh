#!/usr/bin/env bash
# 로컬 모드 실행: Go 백엔드(SQLite, :8080) + Next.js dev 서버(:3000)를 함께 띄운다.
# 환경 변수 불필요. Ctrl-C 한 번으로 둘 다 종료된다.
set -euo pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm install

# 종료 시 이 스크립트의 프로세스 그룹 전체를 죽인다.
# (go run·npm이 낳은 손자 프로세스까지 확실히 정리하기 위해 개별 PID가 아닌 그룹을 겨냥)
cleanup() {
  trap - EXIT INT TERM
  kill -- -$$ 2>/dev/null
}
trap cleanup EXIT INT TERM

go run ./cmd/server &
npm run dev &

wait
