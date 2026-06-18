-- get_admin_unpaid_active_count: 미납 활성 멤버 수 단일 쿼리
-- fee_mem_bal_snap과 team_mem_rel을 DB 내부에서 직접 JOIN하여
-- max_rows 1000 제한과 2-step 쿼리 문제를 동시에 해결

CREATE OR REPLACE FUNCTION public.get_admin_unpaid_active_count(p_team_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT tmr.mem_id)
  FROM public.team_mem_rel tmr
  JOIN public.fee_mem_bal_snap fbs
    ON fbs.mem_id  = tmr.mem_id
   AND fbs.team_id = tmr.team_id
   AND fbs.vers    = 0
   AND fbs.del_yn  = false
   AND fbs.bal_amt < 0
  WHERE tmr.team_id   = p_team_id
    AND tmr.mem_st_cd = 'active'
    AND tmr.vers      = 0
    AND tmr.del_yn    = false;
$$;

-- 관리자 전용 — service_role만 호출 가능
GRANT EXECUTE ON FUNCTION public.get_admin_unpaid_active_count(uuid) TO service_role;
