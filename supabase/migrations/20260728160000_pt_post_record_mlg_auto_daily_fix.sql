-- 운동기록 포인트 — 마일리지런 유입분(mlg_auto)의 차액을 "그날 원천이 실제로 적립됐는지"로 정한다.
-- 선행: 20260728151000_pt_post_record_rules_and_trigger.sql
--
-- ## 무엇이 틀렸나
--
-- `pt_post_record_amt('mlg_auto')`가 **항상 +1**(3 - 2)이었다. 하지만 원천 `mlg_record`는
-- **하루 1건만** +2를 준다(`pt_earn_mlg_record`가 (mem, aply_dt) net으로 판정).
-- 그래서 같은 날 사진 기록 2건이면:
--
--   1번째: mlg_record +2, post_record +1  = 3  ✅
--   2번째: mlg_record  0, post_record +1  = 1  ❌ (문서 계약은 3)
--
-- 실측(dev): 같은 날 2건 → 합계 4점(6이어야 함).
--
-- ## 어떻게 고치나
--
-- 차액을 상수로 박지 않고, **그날 이 사람이 이미 유입분 차액을 받았는지** 보고 정한다.
--   - 그날 첫 유입 기록  → 차액 +1  (원천 +2와 합쳐 3)
--   - 그날 둘째 유입부터 → 전액 +3  (원천은 하루 1건 제한이라 0이므로)
--
-- 어느 쪽이든 그 기록 하나가 만드는 합계는 3으로 같다 — 문서 계약이 실제로 지켜진다.
--
-- ⚠️ 판정 기준이 "그날 mlg_record가 있는가"면 안 된다: 원천은 하루 한 번 잡히므로 같은 날
-- 둘째·셋째 유입 기록도 전부 "원천 있음"으로 읽혀 다 같이 차액(+1)만 받는다(실측으로 확인).
-- 원천이 아니라 **이 활동 자신의 그날 적립 이력**을 봐야 "첫 건만 차액"이 성립한다.
--
-- 금액이 `post_mst` 한 행만으로 결정되지 않게 되므로(그날 원장을 봐야 한다)
-- `pt_post_record_amt(src)`는 더 이상 mlg_auto를 혼자 판정할 수 없다. 날짜·멤버를 받는
-- 새 함수로 옮기고, 기존 함수는 manual 전용으로 좁혀 남긴다(다른 호출부 보호).

-- 그날 이 사람이 마일리지런 유입분으로 이미 적립받은 건수(살아 있는 것만).
-- 0이면 "그날 첫 유입"이라 차액만, 1건 이상이면 원천이 더 안 붙으므로 전액을 준다.
CREATE OR REPLACE FUNCTION public.pt_post_record_mlg_auto_cnt(p_mem_id uuid, p_aply_dt date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
  FROM public.pt_txn_hist t
  JOIN public.post_mst p ON p.post_id = t.ref_id
  WHERE t.mem_id = p_mem_id
    AND t.actv_type_enm = 'post_record'
    AND t.aply_dt = p_aply_dt
    AND p.src_enm = 'mlg_auto'
    -- 회수(revoke)로 상쇄된 글은 세지 않는다 — 순액이 남아 있는 것만 "적립받았다"고 본다
    AND public.pt_net_post_record(t.ref_id) > 0;
$function$;

CREATE OR REPLACE FUNCTION public.pt_post_record_amt_for(
  p_src post_src_enm, p_mem_id uuid, p_aply_dt date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_src = 'manual' THEN public.pt_rule_amt('post_record')
    WHEN p_src = 'mlg_auto' THEN
      CASE
        -- 그날 첫 유입만 원천(+2)과 짝을 이루므로 차액. 둘째부터는 원천이 없어 전액.
        WHEN public.pt_post_record_mlg_auto_cnt(p_mem_id, p_aply_dt) = 0
          THEN public.pt_rule_amt('post_record') - public.pt_rule_amt('mlg_record')
        ELSE public.pt_rule_amt('post_record')
      END
    ELSE 0
  END;
$function$;

COMMENT ON FUNCTION public.pt_post_record_amt_for(post_src_enm, uuid, date) IS
  '운동기록 적립액. mlg_auto는 그날 원천 적립 여부에 따라 차액(+1) 또는 전액(+3) — 합계는 항상 3.';

-- 적립 헬퍼가 새 함수를 쓰도록 교체. 나머지 로직(도입일·직렬화·1회 보장)은 그대로.
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
  IF p_aply_dt < public.pt_intro_dt() THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pt_post_record:' || p_post_id::text)::bigint);

  IF public.pt_net_post_record(p_post_id) <> 0 THEN
    RETURN;
  END IF;

  SELECT src_enm INTO v_src FROM public.post_mst WHERE post_id = p_post_id;

  -- 금액은 (경로, 멤버, 귀속일)로 정한다 — mlg_auto의 차액이 그날 원천 적립 여부에 달렸다.
  v_amt := public.pt_post_record_amt_for(v_src, p_mem_id, p_aply_dt);
  IF v_amt <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'post_record', 'earn', v_amt, p_aply_dt, 'post', p_post_id, p_rsn_txt);
END;
$function$;

-- 기존 단일인자 함수는 manual 전용으로 좁힌다 — mlg_auto를 물으면 0을 돌려 조용히 틀린 값을
-- 주지 않고, 잘못된 호출부가 있으면 적립이 안 되는 것으로 드러나게 한다.
CREATE OR REPLACE FUNCTION public.pt_post_record_amt(p_src post_src_enm)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE p_src
    WHEN 'manual' THEN public.pt_rule_amt('post_record')
    ELSE 0
  END;
$function$;

COMMENT ON FUNCTION public.pt_post_record_amt(post_src_enm) IS
  'DEPRECATED — manual만 판정한다. mlg_auto는 그날 원천 적립 여부가 필요하므로 pt_post_record_amt_for()를 쓸 것.';
