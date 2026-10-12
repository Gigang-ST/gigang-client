-- 기강의 전당 랭킹: 철인3종 대회의 접두어 없는 종목 코드를 TRIATHLON_* 으로 읽는다 (#581)
--
-- 철인 기본 종목은 공통코드 TRI_EVT_CD 에서 오는데 값이 SPRINT·OLYMPIC·HALF·FULL 이다(접두어 없음).
-- 랭킹은 comp_evt_type 을 그대로 evt_cd 로 넘겨서, 철인 FULL·HALF 가 마라톤 풀·하프 칸으로 새고
-- OLYMPIC·SPRINT 는 어느 칸에도 못 섰다. 전당 철인 칸(lib/records-board.ts TRIATHLON_EVENTS)은
-- TRIATHLON_FULL·TRIATHLON_HALF·TRIATHLON_OLYMPIC 만 받는다.
--
-- 저장된 코드를 옮기지 않고 읽는 쪽에서 바꾼다: 이미 TRIATHLON_* 인 옛 데이터는 그대로 통과하고,
-- 공통코드를 바꾸면 종목 칩에 TRIATHLON_FULL 이 그대로 찍힌다.
-- 같은 규칙의 TS 거울은 lib/comp-evt-type.ts 의 toRankingEvtCd() — 저장 시 캐시무효화 판정
-- (app/actions/save-race-record.ts)이 이 RPC 결과와 대조할 때 쓴다. 한쪽을 고치면 다른 쪽도 고친다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_public_team_race_rankings(
  p_team_id uuid
)
RETURNS TABLE (
  mem_id uuid,
  mem_nm text,
  gdr_enm public.gender,
  evt_cd text,
  rec_time_sec integer,
  race_nm text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rr.mem_id,
    mm.mem_nm,
    mm.gdr_enm,
    CASE
      WHEN cm.comp_sprt_cd = 'triathlon'
       AND upper(btrim(ce.comp_evt_type)) IN ('FULL', 'HALF', 'OLYMPIC', 'SPRINT')
      THEN 'TRIATHLON_' || upper(btrim(ce.comp_evt_type))
      ELSE COALESCE(ce.comp_evt_type, 'UNKNOWN')
    END AS evt_cd,
    rr.rec_time_sec,
    rr.race_nm
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm
    ON tm.mem_id = rr.mem_id
   AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active'
   AND tm.vers = 0
   AND tm.del_yn = false
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = rr.mem_id
   AND mm.vers = 0
   AND mm.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id
   AND ce.vers = 0
   AND ce.del_yn = false
  -- 스포츠 판정만 본다. comp_mst 는 comp_id 단독 PK 라 한 행이고, 대회가 소프트삭제돼도
  -- 기록이 랭킹에 서는 지금 동작은 그대로 둔다(그래도 철인 기록이 마라톤 칸으로 새지 않게).
  LEFT JOIN public.comp_mst cm
    ON cm.comp_id = rr.comp_id
  WHERE rr.vers = 0
    AND rr.del_yn = false
    -- 크루 가입일 이전 기록은 랭킹에 세우지 않는다 (등록·보관은 그대로, #528).
    -- 가입 당일 대회는 인정(>=). join_dt가 비면 거르지 않는다(fail-open) —
    -- 가입일 누락으로 기록이 조용히 사라지는 쪽이 더 나쁘다.
    -- 재가입자는 team_mem_rel이 회원당 vers=0 한 행이라 최초 가입일 기준이 된다.
    AND (tm.join_dt IS NULL OR rr.race_dt >= tm.join_dt);
$$;
