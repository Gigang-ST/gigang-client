-- 운동기록(기록 자랑) 등록 포인트 — 룰 금액 · 적립/회수 헬퍼 · 트리거.
-- 선행: 20260728150000_pt_post_record_enum.sql (enum 값 추가)
--
-- ## 적립 규칙 (두 경로 모두 합계 3점)
--
--   직접 등록(manual)     : post_record +3             = 3
--   마일리지런 + 사진      : mlg_record +2, post_record +1 = 3
--   마일리지런 + 사진없음  : mlg_record +2              = 2  (기강이야기에 안 뜨므로 보너스 없음)
--
-- 마일리지런은 원천(evt_mlg_act_hist)에서 이미 mlg_record +2를 받는다. 여기서 3점을 그대로
-- 더 주면 5점이 되어 직접 등록보다 유리해지므로, mlg_auto에는 **차액 +1만** 얹는다.
--
-- **사진 유무를 여기서 판정하지 않는다**: `post_sync_from_mlg_act`가 사진이 있을 때만
-- mlg_auto row를 만들고 사진을 떼면 `del_yn=true`로 내린다. 즉 이 트리거의 INSERT/UPDATE
-- 분기가 곧 "사진이 붙었나/떨어졌나"다.
--
-- **삭제는 DELETE가 아니라 소프트삭제(del_yn=true UPDATE)다** — 회수도 UPDATE에서 잡는다.
-- DELETE 트리거만 달면 앱이 쓰는 삭제 경로를 통째로 놓친다.
--
-- 마일리지런과 달리 **1일 1건 제한이 없다**(사용자 결정). 그래서 net 판정이 아니라
-- ref_id(post_id)로 건별 적립·회수한다 — 같은 글을 지웠다 되살려도 순액은 3점에 수렴.

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
    WHEN 'comp_record'    THEN 20
    WHEN 'mlg_record'     THEN 2
    WHEN 'mlg_goal'       THEN 10
    WHEN 'sch_post'       THEN 5
    WHEN 'post_record'    THEN 3
    ELSE 0
  END;
$function$;

-- 경로별 실제 적립액. manual은 전액, mlg_auto는 원천분을 뺀 차액.
CREATE OR REPLACE FUNCTION public.pt_post_record_amt(p_src post_src_enm)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE p_src
    WHEN 'manual'   THEN public.pt_rule_amt('post_record')
    WHEN 'mlg_auto' THEN public.pt_rule_amt('post_record') - public.pt_rule_amt('mlg_record')
    ELSE 0
  END;
$function$;

-- 이 글(post_id)에 대한 현재 순액. 적립 1회 보장·회수 금액 산정에 함께 쓴다.
CREATE OR REPLACE FUNCTION public.pt_net_post_record(p_post_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(pt_amt), 0)::integer
  FROM public.pt_txn_hist
  WHERE actv_type_enm = 'post_record' AND ref_id = p_post_id;
$function$;

CREATE OR REPLACE FUNCTION public.pt_earn_post_record(
  p_team_id uuid, p_mem_id uuid, p_post_id uuid, p_aply_dt date, p_rsn_txt text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src  post_src_enm;
  v_amt  integer;
BEGIN
  -- 제도 도입일(2026-07-01) 이전 귀속은 미적립 — 다른 활동과 같은 규칙(과거 소급 파밍 차단)
  IF p_aply_dt < public.pt_intro_dt() THEN
    RETURN;
  END IF;

  -- 같은 글에 대한 동시 적립 직렬화 (mlg_record와 같은 장치, 키만 post_id 기준)
  PERFORM pg_advisory_xact_lock(hashtext('pt_post_record:' || p_post_id::text)::bigint);

  -- 이미 살아있는 적립이 있으면 재적립하지 않는다(되살리기 반복에도 한 번만)
  IF public.pt_net_post_record(p_post_id) <> 0 THEN
    RETURN;
  END IF;

  SELECT src_enm INTO v_src FROM public.post_mst WHERE post_id = p_post_id;
  v_amt := public.pt_post_record_amt(v_src);
  IF v_amt <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'post_record', 'earn', v_amt, p_aply_dt, 'post', p_post_id, p_rsn_txt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_revoke_post_record(
  p_team_id uuid, p_mem_id uuid, p_post_id uuid, p_aply_dt date, p_rsn_txt text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_net integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pt_post_record:' || p_post_id::text)::bigint);

  v_net := public.pt_net_post_record(p_post_id);
  IF v_net <= 0 THEN
    RETURN;
  END IF;

  -- 역분개: row를 지우지 않고 음수 회수를 쌓는다(원장 append-only). 귀속일은 적립분과
  -- 같은 날로 맞춰야 같은 월에서 상쇄된다.
  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'post_record', 'revoke', -v_net, p_aply_dt, 'post', p_post_id, p_rsn_txt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pt_trg_post_mst()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 귀속일은 뛴 날(act_dt). 비어 있으면 작성일로 떨어뜨린다(마일리지런과 같은 결).
  v_new_dt date := COALESCE(NEW.act_dt, (NEW.crt_at AT TIME ZONE 'Asia/Seoul')::date);
  v_old_dt date;
BEGIN
  -- 기록 자랑만 대상. manual(직접 등록)과 mlg_auto(마일리지런+사진) 둘 다 받는다 —
  -- 액수는 pt_post_record_amt가 경로별로 갈라 합계 3점을 맞춘다.
  IF NEW.post_type_enm <> 'record_flex' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.del_yn THEN
      PERFORM public.pt_earn_post_record(NEW.team_id, NEW.mem_id, NEW.post_id, v_new_dt,
        '운동기록 등록: ' || to_char(v_new_dt, 'YYYY-MM-DD'));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_dt := COALESCE(OLD.act_dt, (OLD.crt_at AT TIME ZONE 'Asia/Seoul')::date);

    -- 삭제(소프트) — 사진을 뗀 마일리지런도 여기로 온다(sync가 del_yn=true로 내린다)
    IF NEW.del_yn AND NOT OLD.del_yn THEN
      PERFORM public.pt_revoke_post_record(NEW.team_id, NEW.mem_id, NEW.post_id, v_old_dt,
        '운동기록 삭제: ' || to_char(v_old_dt, 'YYYY-MM-DD'));
      RETURN NEW;
    END IF;

    -- 되살리기 — 사진을 다시 붙인 경우 포함
    IF NOT NEW.del_yn AND OLD.del_yn THEN
      PERFORM public.pt_earn_post_record(NEW.team_id, NEW.mem_id, NEW.post_id, v_new_dt,
        '운동기록 복구: ' || to_char(v_new_dt, 'YYYY-MM-DD'));
      RETURN NEW;
    END IF;

    -- 날짜 변경 — 옛 귀속일에서 회수하고 새 귀속일로 다시 적립(월 집계가 따라가야 한다)
    IF NOT NEW.del_yn AND v_new_dt IS DISTINCT FROM v_old_dt THEN
      PERFORM public.pt_revoke_post_record(NEW.team_id, NEW.mem_id, NEW.post_id, v_old_dt,
        '운동기록 날짜 변경(이전 날짜 회수): ' || to_char(v_old_dt, 'YYYY-MM-DD'));
      PERFORM public.pt_earn_post_record(NEW.team_id, NEW.mem_id, NEW.post_id, v_new_dt,
        '운동기록 날짜 변경: ' || to_char(v_new_dt, 'YYYY-MM-DD'));
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pt_post_mst ON public.post_mst;
CREATE TRIGGER trg_pt_post_mst
AFTER INSERT OR UPDATE ON public.post_mst
FOR EACH ROW EXECUTE FUNCTION public.pt_trg_post_mst();
