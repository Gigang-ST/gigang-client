-- 기강의 전당 랭킹에서 크루 가입일 이전 대회기록 제외 (#528)
-- 기록 등록·보관·프로필 노출은 그대로 두고, 랭킹 RPC의 WHERE 절에서만 거른다.
-- 이 RPC는 랭킹 화면(app/(main)/records/page.tsx)과 TOP10 캐시무효화 판정
-- (app/actions/save-race-record.ts)이 공유하는 유일한 출처라 여기만 고치면 양쪽 기준이 같아진다.
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
    COALESCE(ce.comp_evt_type, 'UNKNOWN') AS evt_cd,
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
  WHERE rr.vers = 0
    AND rr.del_yn = false
    -- 크루 가입일 이전 기록은 랭킹에 세우지 않는다 (등록·보관은 그대로).
    -- 가입 당일 대회는 인정(>=). join_dt가 비면 거르지 않는다(fail-open) —
    -- 가입일 누락으로 기록이 조용히 사라지는 쪽이 더 나쁘다.
    -- 재가입자는 team_mem_rel이 회원당 vers=0 한 행이라 최초 가입일 기준이 된다.
    AND (tm.join_dt IS NULL OR rr.race_dt >= tm.join_dt);
$$;
