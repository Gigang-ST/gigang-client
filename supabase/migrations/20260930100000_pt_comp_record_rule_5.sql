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

-- 소급 조정 — ref마다 pt_revoke()/pt_earn()과 **같은 advisory lock**을 먼저 잡고, 잡은 뒤에
-- 순액을 다시 읽어 조정 줄을 넣는다. 잠금 없이 한 번의 INSERT … SELECT로 하면, 마이그레이션
-- 도중 누가 기록을 지웠을 때 두 쪽이 모두 순액 20을 보고 회수(-20)와 조정(-15)이 겹쳐
-- 순액이 -15가 된다. 잠금 대기 전 스냅샷을 쓰지 않도록 순액은 **잠금 다음 문장에서** 계산한다
-- (plpgsql의 각 SQL 문은 READ COMMITTED에서 새 스냅샷을 잡는다).
-- 후보 목록은 잠금 전에 뽑아도 된다 — 잠근 뒤 순액을 다시 보고 5 이하면 건너뛴다.
DO $$
DECLARE
  r     record;
  v_net integer;
  v_amt integer := public.pt_rule_amt('comp_record');
  e     record;
BEGIN
  FOR r IN
    SELECT mem_id, ref_id
    FROM public.pt_txn_hist
    WHERE actv_type_enm = 'comp_record'
    GROUP BY mem_id, ref_id
    HAVING SUM(pt_amt) > v_amt
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('pt_ref:' || r.mem_id::text || ':comp_record:' || coalesce(r.ref_id::text, ''))::bigint);

    v_net := public.pt_net_by_ref(r.mem_id, 'comp_record', r.ref_id);
    CONTINUE WHEN v_net <= v_amt;

    SELECT h.team_id, h.aply_dt, h.ref_type_txt INTO e
    FROM public.pt_txn_hist h
    WHERE h.actv_type_enm = 'comp_record'
      AND h.txn_type_enm = 'earn'
      AND h.mem_id = r.mem_id
      AND h.ref_id IS NOT DISTINCT FROM r.ref_id
    ORDER BY h.crt_at DESC
    LIMIT 1;
    -- earn 줄 없이 순액만 남은 ref는 귀속 정보를 알 수 없다 — 예전 INSERT … SELECT(CROSS JOIN)도 건너뛰던 경우
    CONTINUE WHEN NOT FOUND;

    INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
    VALUES (e.team_id, r.mem_id, 'comp_record', 'manual_adj', v_amt - v_net,
            e.aply_dt, e.ref_type_txt, r.ref_id, '배점 조정: 대회 기록 등록 20→5');
  END LOOP;
END;
$$;
