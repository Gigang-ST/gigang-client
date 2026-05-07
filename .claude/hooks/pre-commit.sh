#!/bin/bash
# 커밋 전 품질 검사: TypeScript 타입 검사 → lint
# 실패 시 exit 2로 차단

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "🔍 TypeScript 타입 검사 중..."
pnpm tsc --noEmit || exit 2

echo "🔍 ESLint 검사 중..."
pnpm run lint --quiet || exit 2

echo "✅ 모든 검사 통과!"
exit 0
