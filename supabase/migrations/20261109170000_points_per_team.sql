-- 기강 포인트를 팀별로 — 두 팀 소속자의 적립·회수가 엉뚱한 팀으로 가거나 한 팀에서 막히던 것.
--
-- 1) 대회 기록(rec_race_hist)은 사람 것이라(2026-11-09 결정) 그 사람이 **활동 중인(탈퇴 제외) 팀마다** 적립한다.
--    예전엔 소속 팀 중 아무 하나를 LIMIT 1 로 골라, 적립한 팀과 회수한 팀이 다를 수 있었다(한쪽 +5, 다른 쪽 -5).
--    삭제할 땐 실제로 적립된 팀마다 그만큼 회수한다.
-- 2) 중복 적립 판정(net)·직렬화 잠금 키에 팀을 넣는다. 예전엔 회원 기준이라, 두 팀 마일리지런에 다 참가한
--    사람이 같은 날 기록하면 먼저 들어간 팀만 적립되고 다른 팀은 0이 됐다(회수도 두 팀 합계를 한쪽에서 뺐다).
--
-- 앱 코드는 이 함수들을 직접 부르지 않는다(전부 원천 테이블 트리거). 원장(pt_txn_hist)의 기존 행은 건드리지 않는다.
SET lock_timeout = '3s';

-- ── 판정 함수: 팀 인자 버전 ──
CREATE OR REPLACE FUNCTION public.pt_net_by_ref(p_team_id uuid, p_mem_id uuid, p_actv pt_actv_type_enm, p_ref_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(SUM(pt_amt), 0)::integer
  FROM public.pt_txn_hist
  WHERE team_id = p_team_id
    AND mem_id = p_mem_id
    AND actv_type_enm = p_actv
    AND ref_id IS NOT DISTINCT FROM p_ref_id;
$function$;
-- 3인자 pt_net_by_ref(mem, actv, ref)는 남긴다 — recheck_mlg_goal 이 시즌 목표(goal_id, 팀 고유)로 쓴다.

CREATE OR REPLACE FUNCTION public.pt_net_mlg_record(p_team_id uuid, p_mem_id uuid, p_aply_dt date)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(SUM(pt_amt), 0)::integer
  FROM public.pt_txn_hist
  WHERE team_id = p_team_id
    AND mem_id = p_mem_id
    AND actv_type_enm = 'mlg_record'
    AND ref_id IS NULL
    AND aply_dt = p_aply_dt;
$function$;

CREATE OR REPLACE FUNCTION public.pt_post_record_mlg_auto_cnt(p_team_id uuid, p_mem_id uuid, p_aply_dt date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
  FROM public.pt_txn_hist t
  JOIN public.post_mst p ON p.post_id = t.ref_id
  WHERE t.team_id = p_team_id
    AND t.mem_id = p_mem_id
    AND t.actv_type_enm = 'post_record'
    AND t.aply_dt = p_aply_dt
    AND p.src_enm = 'mlg_auto'
    AND public.pt_net_post_record(t.ref_id) > 0;
$function$;

CREATE OR REPLACE FUNCTION public.pt_post_record_amt_for(p_team_id uuid, p_src post_src_enm, p_mem_id uuid, p_aply_dt date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_src = 'manual' THEN public.pt_rule_amt('post_record')
    WHEN p_src = 'mlg_auto' THEN
      CASE
        WHEN public.pt_post_record_mlg_auto_cnt(p_team_id, p_mem_id, p_aply_dt) = 0
          THEN public.pt_rule_amt('post_record') - public.pt_rule_amt('mlg_record')
        ELSE public.pt_rule_amt('post_record')
      END
    ELSE 0
  END;
$function$;

-- ── 적립·회수: 팀으로 판정하고 팀으로 잠근다 ──
CREATE OR REPLACE FUNCTION public.pt_earn(p_team_id uuid, p_mem_id uuid, p_actv pt_actv_type_enm, p_aply_dt date, p_ref_type text, p_ref_id uuid, p_rsn_txt text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_aply_dt < public.pt_intro_dt() THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('pt_ref:' || p_team_id::text || ':' || p_mem_id::text || ':' || p_actv::text || ':' || coalesce(p_ref_id::text, ''))::bigint);

  IF public.pt_net_by_ref(p_team_id, p_mem_id, p_actv, p_ref_id) <> 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, p_actv, 'earn', public.pt_rule_amt(p_actv), p_aply_dt, p_ref_type, p_ref_id, p_rsn_txt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_revoke(p_team_id uuid, p_mem_id uuid, p_actv pt_actv_type_enm, p_aply_dt date, p_ref_type text, p_ref_id uuid, p_rsn_txt text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_net integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('pt_ref:' || p_team_id::text || ':' || p_mem_id::text || ':' || p_actv::text || ':' || coalesce(p_ref_id::text, ''))::bigint);

  v_net := public.pt_net_by_ref(p_team_id, p_mem_id, p_actv, p_ref_id);
  IF v_net <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, p_actv, 'revoke', -v_net, p_aply_dt, p_ref_type, p_ref_id, p_rsn_txt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_earn_mlg_record(p_team_id uuid, p_mem_id uuid, p_aply_dt date, p_rsn_txt text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_aply_dt < public.pt_intro_dt() THEN
    RETURN;
  END IF;

  -- 동시성 직렬화: (팀, mem, 날짜) — 같은 날 기록 다건이라 유니크 제약이 없어 net 판정이 레이스할 수 있다
  PERFORM pg_advisory_xact_lock(hashtext('pt_mlg_record:' || p_team_id::text || ':' || p_mem_id::text || ':' || p_aply_dt::text)::bigint);

  IF public.pt_net_mlg_record(p_team_id, p_mem_id, p_aply_dt) <> 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'mlg_record', 'earn', public.pt_rule_amt('mlg_record'), p_aply_dt, 'mlg_act', NULL, p_rsn_txt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_revoke_mlg_record(p_team_id uuid, p_mem_id uuid, p_aply_dt date, p_rsn_txt text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_net integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pt_mlg_record:' || p_team_id::text || ':' || p_mem_id::text || ':' || p_aply_dt::text)::bigint);

  v_net := public.pt_net_mlg_record(p_team_id, p_mem_id, p_aply_dt);
  IF v_net <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'mlg_record', 'revoke', -v_net, p_aply_dt, 'mlg_act', NULL, p_rsn_txt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_earn_post_record(p_team_id uuid, p_mem_id uuid, p_post_id uuid, p_aply_dt date, p_rsn_txt text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src  post_src_enm;
  v_amt  integer;
BEGIN
  IF p_aply_dt < public.pt_intro_dt() THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pt_post_record:' || p_post_id::text)::bigint);

  IF public.pt_net_post_record(p_post_id) <> 0 THEN
    RETURN;
  END IF;

  SELECT src_enm INTO v_src FROM public.post_mst WHERE post_id = p_post_id;

  v_amt := public.pt_post_record_amt_for(p_team_id, v_src, p_mem_id, p_aply_dt);
  IF v_amt <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'post_record', 'earn', v_amt, p_aply_dt, 'post', p_post_id, p_rsn_txt);
END;
$function$;

-- 팀 없는 옛 판정 함수 — 위에서 호출부를 다 바꿨으니 지운다(남겨 두면 누가 다시 팀 없이 부른다)
DROP FUNCTION IF EXISTS public.pt_net_mlg_record(uuid, date);
DROP FUNCTION IF EXISTS public.pt_post_record_amt_for(post_src_enm, uuid, date);
DROP FUNCTION IF EXISTS public.pt_post_record_mlg_auto_cnt(uuid, date);

-- ── 대회 기록: 활동 중인 팀마다 적립, 적립된 팀마다 회수 ──
CREATE OR REPLACE FUNCTION public.pt_trg_rec_race_hist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR v_team_id IN
      SELECT DISTINCT tmr.team_id
      FROM public.team_mem_rel tmr
      WHERE tmr.mem_id = NEW.mem_id AND tmr.vers = 0 AND tmr.del_yn = false
        AND tmr.mem_st_cd <> 'left'
    LOOP
      PERFORM public.pt_earn(
        v_team_id, NEW.mem_id, 'comp_record', NEW.race_dt, 'race_result', NEW.race_result_id,
        '대회 기록 등록: ' || NEW.race_nm
      );
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- 실제로 적립된 팀마다 회수한다(그 사이 탈퇴했어도 그 팀 원장은 맞춰야 한다)
    FOR v_team_id IN
      SELECT DISTINCT t.team_id
      FROM public.pt_txn_hist t
      WHERE t.mem_id = OLD.mem_id AND t.actv_type_enm = 'comp_record' AND t.ref_id = OLD.race_result_id
    LOOP
      PERFORM public.pt_revoke(
        v_team_id, OLD.mem_id, 'comp_record', OLD.race_dt, 'race_result', OLD.race_result_id,
        '대회 기록 삭제: ' || OLD.race_nm
      );
    END LOOP;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

-- 내부 함수 — API(RPC)로 부를 이유가 없다
REVOKE ALL ON FUNCTION public.pt_net_by_ref(uuid, uuid, pt_actv_type_enm, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.pt_net_mlg_record(uuid, uuid, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.pt_post_record_mlg_auto_cnt(uuid, uuid, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.pt_post_record_amt_for(uuid, post_src_enm, uuid, date) FROM public, anon, authenticated;
