#!/usr/bin/env bash
# PostToolUse hook: auto-gofmt + go vet on the edited Go file.
# Silent on success (zero LLM tokens); exit 2 feeds vet errors back to Claude.
set -u

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
case "$f" in
  *.go) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

gofmt -w "$f" 2>/dev/null

dir=$(dirname "$f")
rel=$(realpath --relative-to="$PWD" "$dir" 2>/dev/null) || rel="$dir"
if ! out=$(go vet "./$rel" 2>&1); then
  {
    echo "go vet failed for ./$rel:"
    echo "$out"
  } >&2
  exit 2
fi
exit 0
