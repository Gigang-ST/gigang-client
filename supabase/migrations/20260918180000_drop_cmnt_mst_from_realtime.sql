-- 댓글 실시간 구독 철거 — `cmnt_mst`를 supabase_realtime 퍼블리케이션에서 뺀다.
--
-- 왜:
--   `postgres_changes` 구독 하나가 DB에 두 가지 일을 시킨다 — ① Realtime이 WAL을 계속
--   폴링하고, ② 변경 행마다 **구독자 수만큼** RLS 정책을 재실행해 열람권을 판정한다.
--   댓글은 "동시에 같은 글을 보고 있을 때 남의 댓글이 자동으로 뜨는" 경우에만 값을 내는데,
--   실측 댓글량이 적어 그 상황 자체가 드물다. 상시 비용만 남는 구조였다.
--   (§.claude/docs/perf/2026-09-18-performance-audit.md — 2차 검토 C)
--
-- 앱 쪽은 이미 구독을 걷어냈다(`comment-section.tsx` · `use-post-comments.ts`).
-- ⚠️ **코드에서 구독만 빼고 여기를 안 빼면 절약이 0이다** — 듣는 사람이 없어도 WAL 디코딩은
--    테이블이 퍼블리케이션에 올라 있는 한 계속 돈다. 실제로 같은 함정을 한 번 겪었다
--    (`msg_mst`·`pldg_mst`: 구독 코드가 없는데 퍼블리케이션에 남아 있었다 — 다만 그 둘은
--    INSERT가 0건이라 비용도 0이었다. `cmnt_mst`는 실제로 쓰기가 일어나므로 경우가 다르다).
--
-- 되돌리기: ALTER PUBLICATION supabase_realtime ADD TABLE public.cmnt_mst;
--   (앱에 구독 코드를 되살리는 것과 **함께** 해야 뜻이 있다)

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cmnt_mst'
  ) then
    alter publication supabase_realtime drop table public.cmnt_mst;
  end if;
end
$$;
