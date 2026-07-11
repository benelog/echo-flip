#!/usr/bin/env bash
# 로컬 모드 실행: Go 서버 하나(:8080)가 HTML 페이지와 API를 모두 서빙한다.
# 환경 변수 불필요, SQLite 파일(local-db/echo-flip.db) 사용, 로그인 없음.
set -euo pipefail
cd "$(dirname "$0")"

exec go run ./cmd/server
