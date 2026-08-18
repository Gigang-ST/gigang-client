-- 동시성 구멍 셋을 막는다. 셋 다 "읽고 → 판단하고 → 쓴다" 사이에 잠금이 없어서,
-- 두 요청이 겹치면 **둘 다 옛 값을 보고** 각자 쓰는 형태다.
--
-- 지금 규모(단일 팀·수십 명)에선 잘 안 터지지만, **터지면 조용히 틀린다** — 셋 다 화면엔
-- 정상으로 보이고 숫자만 어긋난다. 배치 자동화로 "사람이 없는 시간대에 도는 쓰기"가
-- 생기면서 겹칠 창이 실제로 열렸다(예전엔 둘 다 수동이라 한 사람이 순서대로 눌렀다).

-- ---------------------------------------------------------------------------
-- ① 대표 칭호 승격이 동시 수여에서 유니크 제약에 걸려 수여가 **누락**되던 것
-- ---------------------------------------------------------------------------
-- 두 경로가 같은 멤버에게 동시에 칭호를 주면(실시간 훅이 도는 중에 배치가 같은 사람을
-- 평가하는 등) 두 트리거가 각자 "남의 대표를 내리고 내 것을 올린다"를 실행한다. 서로의
-- 미커밋 행을 못 보므로 **둘 다 자기 것을 대표로** 세우고, 커밋 시점에
-- uk_mem_ttl_rel_team_mem_primary_current(23505)에 걸린다.
--
-- 그런데 이 오류는 INSERT 트랜잭션을 통째로 되돌린다 — engine.ts는 로그만 남기고 다음
-- 칭호로 넘어가므로 **그 칭호는 부여되지 않은 채 조용히 사라진다.** 대표가 누구냐의
-- 문제가 아니라 수여 자체가 없어지는 문제다.
--
-- 멤버 단위 advisory lock으로 직렬화한다. 뒤에 온 쪽은 앞이 커밋될 때까지 기다렸다가
-- **앞의 결과를 보고** 자기 것을 올리므로 위반이 구조적으로 안 생긴다. 잠금 범위가
-- team_mem_id 하나라 다른 멤버끼리는 그대로 병렬이다.
CREATE OR REPLACE FUNCTION public.mem_ttl_rel_promote_latest_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grp integer;
  v_lvl integer;
BEGIN
  IF NEW.vers <> 0 OR NEW.del_yn THEN
    RETURN NULL;
  END IF;

  IF NEW.exp_at IS NOT NULL AND NEW.exp_at <= now() THEN
    RETURN NULL;
  END IF;

  -- 이 멤버의 대표 자리를 만지는 동안 다른 트랜잭션을 세운다(트랜잭션 종료 시 자동 해제).
  -- 아래 EXISTS 판정까지 함께 감싼다 — 안 그러면 동시에 들어온 상위 등급을 못 보고
  -- 하위 등급을 대표로 세울 수 있다.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.team_mem_id::text));

  SELECT t.ttl_group_cd, t.rarity_level
    INTO v_grp, v_lvl
    FROM public.ttl_mst t
   WHERE t.team_id = NEW.team_id AND t.ttl_id = NEW.ttl_id
     AND t.vers = 0 AND NOT t.del_yn;

  IF v_grp IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.mem_ttl_rel m
      JOIN public.ttl_mst t
        ON t.team_id = m.team_id AND t.ttl_id = m.ttl_id
       AND t.vers = 0 AND NOT t.del_yn
     WHERE m.team_mem_id = NEW.team_mem_id
       AND m.vers = 0 AND NOT m.del_yn
       AND m.mem_ttl_id <> NEW.mem_ttl_id
       AND t.ttl_group_cd = v_grp
       AND t.rarity_level > COALESCE(v_lvl, 1)
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.mem_ttl_rel
     SET is_prmy_yn = false,
         upd_at = now()
   WHERE team_mem_id = NEW.team_mem_id
     AND is_prmy_yn
     AND vers = 0
     AND del_yn = false
     AND mem_ttl_id <> NEW.mem_ttl_id;

  UPDATE public.mem_ttl_rel
     SET is_prmy_yn = true,
         upd_at = now()
   WHERE mem_ttl_id = NEW.mem_ttl_id
     AND NOT is_prmy_yn;

  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- ② 월별 면제 총액 캡이 동시 적재에서 뚫리던 것
-- ---------------------------------------------------------------------------
-- 규칙 면제(잔액 재계산)와 참여 감면(배치)이 각자 "그 달 기존 면제 합"을 읽고 남은 여유만큼
-- 적재한다. 그런데 둘이 겹치면 **둘 다 합계 0을 보고** 각자 전액을 넣어 부과액을 넘고,
-- 잔액이 +로 간다 — 2026-07 prd에서 실제로 2명에게 일어난 그 사고다(앱 캡은 그걸 고쳤지만
-- 캡 자체가 옛 값을 근거로 계산되는 창은 남아 있었다).
--
-- **앱의 캡을 DB로 옮기지 않는다.** 정책 해석(어느 달·얼마)은 앱에 두고
-- (lib/dues/calc-exemption.ts + 테스트), 여기는 **넘으면 막는 최후 방어선**만 둔다.
-- 정상 경로에선 앱이 이미 깎아 넣으므로 이 트리거는 아무 일도 하지 않는다.
--
-- 막을 때 캡으로 조용히 깎지 않고 **예외를 던진다**: 여기까지 왔다는 건 앱 캡이 옛 값을
-- 봤다는 뜻이라, 조용히 깎으면 그 사실이 어디에도 안 남는다. 배치는 실패로 기록되고
-- 실패 알림이 나가므로 사람이 알게 된다. 돈이 걸린 값은 조용히 맞추는 것보다
-- 시끄럽게 틀리는 편이 낫다.
CREATE OR REPLACE FUNCTION public.fee_due_exm_month_cap_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sum int;
  v_fee int;
BEGIN
  IF NEW.del_yn OR COALESCE(NEW.exm_amt, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- 회원 x 귀속월 단위로 직렬화한다. 뒤에 온 쪽은 앞이 커밋된 뒤에 합계를 읽는다.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.mem_id::text || NEW.aply_ym));

  -- 그 달에 적용되는 정책의 월 회비. 기간이 겹치는 정책이 있으면 **가장 늦게 시작한 것**을
  -- 쓴다(배치·재계산과 같은 규칙). 정책이 없으면 판단 근거가 없으므로 통과시킨다.
  SELECT p.monthly_fee_amt INTO v_fee
    FROM public.fee_policy_cfg p
   WHERE p.team_id = NEW.team_id
     AND p.vers = 0 AND p.del_yn = false
     AND p.aply_stt_dt <= (NEW.aply_ym || '-01')::date
     AND p.aply_end_dt >= (NEW.aply_ym || '-01')::date
   ORDER BY p.aply_stt_dt DESC
   LIMIT 1;

  IF v_fee IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(e.exm_amt), 0) INTO v_sum
    FROM public.fee_due_exm_hist e
   WHERE e.team_id = NEW.team_id
     AND e.mem_id  = NEW.mem_id
     AND e.aply_ym = NEW.aply_ym
     AND e.del_yn  = false
     AND (TG_OP = 'INSERT' OR e.exm_hist_id <> NEW.exm_hist_id);

  IF v_sum + NEW.exm_amt > v_fee THEN
    RAISE EXCEPTION
      '월별 면제 총액이 부과액을 넘습니다 (mem_id=%, aply_ym=%, 기존 %원 + 신규 %원 > 부과 %원). 동시 적재로 앱 캡이 옛 값을 봤을 수 있습니다.',
      NEW.mem_id, NEW.aply_ym, v_sum, NEW.exm_amt, v_fee;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fee_due_exm_month_cap ON public.fee_due_exm_hist;
CREATE TRIGGER trg_fee_due_exm_month_cap
  BEFORE INSERT OR UPDATE OF exm_amt ON public.fee_due_exm_hist
  FOR EACH ROW EXECUTE FUNCTION public.fee_due_exm_month_cap_guard();

COMMENT ON FUNCTION public.fee_due_exm_month_cap_guard() IS
  '월별 면제 총액이 그 달 부과액을 넘지 못하게 막는 최후 방어선. 캡 계산 자체는 앱(lib/dues/calc-exemption.ts)이 하고, 여기는 동시 적재로 앱이 옛 합계를 본 경우만 잡아 예외를 던진다(조용히 깎지 않는다 - 돈이 걸린 값이라 사람이 알아야 한다).';

-- ---------------------------------------------------------------------------
-- ③ 전광판 칭호획득 RPC가 데이터 하나로 통째로 죽을 수 있던 것
-- ---------------------------------------------------------------------------
-- 뉴비 제외 조건이 (cond_rule_json->>'days')::int = 0 이었다. Postgres는 AND 피연산자의
-- 평가 순서를 보장하지 않으므로, 좌항(type = 'membership_days')이 먼저 걸러 준다는 보장이
-- 없다. days가 숫자가 아닌 칭호가 하나라도 생기면 이 RPC 전체가
-- invalid input syntax for type integer로 실패한다.
--
-- 그런데 조회부(lib/queries/story-titles.ts)는 실패를 빈 배열로 삼키므로, **칭호획득 슬롯이
-- 이유 없이 사라지고** 원인 추적이 어렵다. 캐스팅을 없애고 텍스트로 비교하면 어떤 값이
-- 들어와도 던지지 않는다(같은 줄의 ->>'type' 비교와 형태도 맞는다).
CREATE OR REPLACE FUNCTION public.get_team_recent_title_grants(p_team_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT t.ttl_id, t.ttl_nm, t.ttl_desc, t.desc_visibility,
           mm.mem_id, mm.mem_nm, mm.avatar_url, mt.grnt_at,
           row_number() OVER (PARTITION BY t.ttl_id ORDER BY mt.grnt_at DESC) AS rn,
           count(*) OVER (PARTITION BY t.ttl_id) AS grant_cnt
    FROM public.mem_ttl_rel mt
    INNER JOIN public.ttl_mst t
      ON t.ttl_id = mt.ttl_id
     AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
    INNER JOIN public.team_mem_rel tm
      ON tm.team_mem_id = mt.team_mem_id
     AND tm.vers = 0 AND tm.del_yn = false AND tm.mem_st_cd = 'active'
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
    WHERE mt.team_id = p_team_id
      AND mt.vers = 0 AND mt.del_yn = false
      AND (mt.exp_at IS NULL OR mt.exp_at > now())
      -- 30일 창은 절대시각 비교(now() - interval)라 KST 날짜 경계 함정이 없다.
      AND mt.grnt_at >= now() - make_interval(days => GREATEST(p_days, 1))
      -- 뉴비 제외. cond_rule_json이 NULL인 수동 칭호가 NULL 전파로 통째로 걸러지지 않게
      -- COALESCE로 감싼다 — NOT(NULL) = NULL은 WHERE에서 false로 떨어진다.
      -- days는 **텍스트로 비교한다**(::int 캐스팅 금지 — AND 단축평가에 기대면 안 된다).
      AND NOT COALESCE(
        t.cond_rule_json->>'type' = 'membership_days'
        AND t.cond_rule_json->>'days' = '0',
        false
      )
  ),
  g AS (
    SELECT ttl_id, ttl_nm, ttl_desc, desc_visibility,
           max(grnt_at) AS last_grnt_at,
           -- grant_cnt는 파티션 전체에서 상수라 max()는 값을 바꾸지 않는다 —
           -- GROUP BY에 없는 컬럼이라 집계 함수로 감싸야 하는 문법상 요구일 뿐이다.
           max(grant_cnt) AS grant_cnt,
           jsonb_agg(jsonb_build_object(
             'mem_id',     mem_id,
             'mem_nm',     mem_nm,
             'avatar_url', avatar_url,
             'grnt_at',    grnt_at
           ) ORDER BY grnt_at DESC) FILTER (WHERE rn <= 10) AS grants
    FROM ranked
    GROUP BY ttl_id, ttl_nm, ttl_desc, desc_visibility
  ),
  m AS (
    SELECT count(DISTINCT mem_id) AS total_mem_cnt FROM ranked
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ttl_id',          g.ttl_id,
    'ttl_nm',          g.ttl_nm,
    'ttl_desc',        g.ttl_desc,
    'desc_visibility', g.desc_visibility,
    'last_grnt_at',    g.last_grnt_at,
    'grant_cnt',       g.grant_cnt,
    'total_mem_cnt',   m.total_mem_cnt,
    'grants',          g.grants
  ) ORDER BY g.last_grnt_at DESC), '[]'::jsonb)
  FROM g CROSS JOIN m;
$function$;
