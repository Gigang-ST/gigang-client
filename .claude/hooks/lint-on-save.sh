#!/bin/bash
# Edit/Write 후 자동 lint (비차단)
# Claude Code PostToolUse 훅 — stdin으로 JSON 페이로드 수신

INPUT=$(cat)

# 편집된 파일 경로 추출 (Python3 JSON 파싱)
FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    path = d.get('tool_input', {}).get('file_path', '')
    print(path)
except:
    print('')
" 2>/dev/null)

if [[ -n "$FILE" && "$FILE" =~ \.(ts|tsx)$ ]]; then
  cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  pnpm exec eslint "$FILE" --fix --quiet 2>&1 || true
fi

exit 0
