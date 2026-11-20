#!/usr/bin/env bash
# 저장소 supabase/migrations ↔ DB 적용 목록 대조 (읽기 전용, DB 접속 없음).
# 사용: scripts/check-migration-history.sh <적용목록.tsv>
#   적용목록.tsv = "version<TAB>name" 한 줄씩(헤더 한 줄 허용).
#   뽑는 법(Supabase MCP execute_sql 또는 SQL 에디터, 조회만):
#     select version, name from supabase_migrations.schema_migrations order by version;
# 출력: 같음 / 이름만 같고 버전 다름 / DB에만 있음(저장소에 파일 없음) / 저장소에만 있음(미적용).
# 이름 기준으로 맞춘다 — Supabase MCP apply_migration 은 버전을 적용 시각으로 찍기 때문이다(docs/db-migration-history.md).
set -euo pipefail
applied="${1:?적용목록.tsv 경로가 필요하다}"
dir="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
(cd "$dir" && ls ./*.sql | sed -E 's#^\./([0-9]+)_(.*)\.sql$#\1\t\2#') | sort > "$tmp/repo"
grep -E '^[0-9]+'"$(printf '\t')" "$applied" | sort > "$tmp/db"
awk -F'\t' -v OFS='\t' '
  NR==FNR { rv[$2]=$1; next }
  { dv[$2]=$1 }
  END {
    for (n in dv) { if (!(n in rv)) print "DB_ONLY", dv[n], n; else if (rv[n]!=dv[n]) print "VERSION_DIFF", dv[n], n, rv[n] }
    for (n in rv) if (!(n in dv)) print "REPO_ONLY", rv[n], n
  }' "$tmp/repo" "$tmp/db" | sort -k1,1 -k2,2 > "$tmp/out"
for k in DB_ONLY VERSION_DIFF REPO_ONLY; do echo "$k $(grep -c "^$k" "$tmp/out" || true)건"; done
cat "$tmp/out"
! grep -q '^DB_ONLY' "$tmp/out"
