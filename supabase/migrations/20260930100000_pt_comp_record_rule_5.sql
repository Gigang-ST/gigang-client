-- 대회 기록 등록(comp_record) 배점을 20 → 5로 내린다. 기존 적립분도 소급한다.
--
-- 운영 판단(2026-09-30). 대회 참가(20)는 그대로다.
--
-- 소급은 원장을 고치지 않고 **조정 줄을 덧붙인다**(manual_adj, 같은 ref). 회수 함수
-- pt_revoke()가 배점표가 아니라 ref의 현재 순액(pt_net_by_ref)을 빼므로, 순액을 5로
-- 맞춰 두면 나중에 기록을 지워도 -5만 나가 0에 수렴한다. earn 행의 pt_amt를 5로
-- UPDATE하면 이미 회수된 ref(20 - 20)가 -15로 뒤집힌다 — 그래서 덧붙이는 쪽이다.
-- 귀속일은 원 적립과 같게 둬 같은 달 안에서 상쇄된다. 재실행해도 순액이 5라 멱등이다.

CREATE OR REPLACE FUNCTION public.pt_rule_amt(p_actv pt_actv_type_enm)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE p_actv
    WHEN 'regular_attend' THEN 30
    WHEN 'gthr_attend'    THEN 10
    WHEN 'evt_attend'     THEN 20
    WHEN 'gthr_host'      THEN 5
    WHEN 'comp_join'      THEN 20
    WHEN 'comp_record'    THEN 5
    WHEN 'mlg_record'     THEN 2
    WHEN 'mlg_goal'       THEN 10
    WHEN 'sch_post'       THEN 5
    WHEN 'post_record'    THEN 3
    ELSE 0
  END;
$function$;

INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
SELECT e.team_id, n.mem_id, 'comp_record', 'manual_adj',
       public.pt_rule_amt('comp_record') - n.net,
       e.aply_dt, e.ref_type_txt, n.ref_id,
       '배점 조정: 대회 기록 등록 20→5'
FROM (
  SELECT mem_id, ref_id, SUM(pt_amt)::integer AS net
  FROM public.pt_txn_hist
  WHERE actv_type_enm = 'comp_record'
  GROUP BY mem_id, ref_id
  HAVING SUM(pt_amt) > public.pt_rule_amt('comp_record')
) n
CROSS JOIN LATERAL (
  SELECT h.team_id, h.aply_dt, h.ref_type_txt
  FROM public.pt_txn_hist h
  WHERE h.actv_type_enm = 'comp_record'
    AND h.txn_type_enm = 'earn'
    AND h.mem_id = n.mem_id
    AND h.ref_id IS NOT DISTINCT FROM n.ref_id
  ORDER BY h.crt_at DESC
  LIMIT 1
) e;
