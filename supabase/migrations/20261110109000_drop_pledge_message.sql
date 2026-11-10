-- 목표 한마디(pldg_mst)·종이비행기 한마디(msg_mst) 걷기 — 2026-11-10 유저 결정. 화면은 2026-07-28부터 꺼져 있었고
-- 코드는 같은 PR 에서 지웠다. prd 데이터는 두 테이블 모두 0건(한 번도 안 쓰였다), 다른 테이블이 참조하지 않는다.
-- 되살릴 땐 옛 마이그레이션(테이블·함수 정의)과 이 커밋을 되돌린다.
--
-- 순서가 중요하다 — 홈 피드 함수(get_team_story_feed)가 pldg_mst 를 읽고 있어 테이블부터 지우면 홈이 깨진다.
-- 1) 피드 함수에서 목표 한마디 부분(recent_pledges 덩어리 + 결과의 'pledges' 칸)을 뺀다. 함수가 길어 통째로 옮겨
--    적지 않고 지금 정의에서 그 두 곳만 잘라 다시 만든다 — 자를 곳을 정확히 못 찾으면 멈춘다.
-- 2) 이 두 테이블만 쓰는 함수(get_team_pledges·get_team_messages·set_message_fly_dist)를 지운다.
-- 3) 두 테이블을 읽는 함수가 하나도 안 남았는지 확인한 뒤 실시간 목록에서 빼고 테이블을 지운다.

-- 1) 홈 피드 함수
SET lock_timeout = '3s';

DO $$
DECLARE
  -- 줄바꿈 통일 — Windows 에서 체크아웃한(CRLF) 파일로 로컬 DB 를 만들면 함수 본문에  이 섞여 아래 찾기가 어긋난다(PR #649 리뷰)
  d text := replace(pg_get_functiondef('public.get_team_story_feed(uuid, uuid)'::regprocedure), E'\r\n', E'\n');
  cte_from int;
  cte_to int;
  key_from int;
  key_to int;
  key_end_marker text := 'FROM recent_pledges p), ''[]''::jsonb)';
BEGIN
  IF position('pldg_mst' IN d) = 0 THEN
    RAISE NOTICE 'get_team_story_feed: 이미 목표 한마디가 빠져 있어 건너뜀';
    RETURN;
  END IF;

  -- (a) WITH 절의 recent_pledges 덩어리 — 바로 뒤 rctn 덩어리 앞까지
  cte_from := position('recent_pledges AS (' IN d);
  cte_to := position('rctn AS (' IN d);
  IF cte_from = 0 OR cte_to <= cte_from
     OR position('FROM public.pldg_mst' IN substr(d, cte_from, cte_to - cte_from)) = 0 THEN
    RAISE EXCEPTION 'get_team_story_feed: recent_pledges 덩어리를 찾지 못함 — 정의가 예상과 다르다';
  END IF;
  d := substr(d, 1, cte_from - 1) || substr(d, cte_to);

  -- (b) 결과의 'pledges' 칸 — 앞 칸(actv_rank) 뒤 쉼표부터 칸 끝까지
  key_from := position(E',\n  ''pledges'', COALESCE(' IN d);
  key_to := position(key_end_marker IN d);
  IF key_from = 0 OR key_to <= key_from THEN
    RAISE EXCEPTION 'get_team_story_feed: ''pledges'' 칸을 찾지 못함 — 정의가 예상과 다르다';
  END IF;
  d := substr(d, 1, key_from - 1) || substr(d, key_to + length(key_end_marker));

  IF position('pldg' IN d) > 0 OR position('recent_pledges' IN d) > 0 THEN
    RAISE EXCEPTION 'get_team_story_feed: 목표 한마디 흔적이 남았다 — 자르기가 어긋났다';
  END IF;
  EXECUTE d;
END $$;

-- 2) 두 테이블만 쓰는 함수 — 인자 모양이 환경마다 달라도 이름으로 찾아 모두 지운다
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_team_pledges', 'get_team_messages', 'set_message_fly_dist')
  LOOP
    EXECUTE format('DROP FUNCTION %s', f);
  END LOOP;
END $$;

-- 3) 남은 참조 확인 → 실시간 목록에서 빼기 → 테이블 지우기
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO leftover
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND (p.prosrc ILIKE '%pldg_mst%' OR p.prosrc ILIKE '%msg_mst%');
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '아직 pldg_mst/msg_mst 를 읽는 함수가 있다: % — 테이블을 지우지 않는다', leftover;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pldg_mst') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.pldg_mst;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'msg_mst') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.msg_mst;
  END IF;
END $$;

DROP TABLE IF EXISTS public.pldg_mst;
DROP TABLE IF EXISTS public.msg_mst;
