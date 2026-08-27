-- ============================================================
-- 모임 참여조건 · 운영진 승인제 — ③ 상태 전이 RPC
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §5
--
-- 전부 service_role 전용(SECURITY DEFINER)이다. 참여조건 판정은 여기 없다 —
-- 판정 정본은 lib/gathering/join-condition.ts 한 곳이고(§4), 이 RPC 들은 앱 서버가
-- 그 게이트를 통과시킨 뒤에만 호출한다. SQL 에 조건을 한 벌 더 구현하면 진실이 둘이 된다.
--
-- 반환은 예외가 아니라 결과 코드(text)다. 정원 마감·이미 처리됨 같은 것은 "오류"가
-- 아니라 운영진에게 그대로 보여줄 상태이고, 예외로 던지면 호출부가 메시지 문자열을
-- 파싱해 분기하게 된다.
-- ============================================================

-- ── 1. approve_gthr_application — 대기 → 확정 ──
--
-- 모임 행을 FOR UPDATE 로 잠그고 센다. joinGatheringWithCapCheck 의 정원 체크는
-- COUNT → upsert 2단계라 원자적이지 않은데(TOCTOU), 승인은 운영진이 목록에서 연달아
-- 누르는 동작이라 정확히 그 레이스를 탄다. 그래서 재사용하지 않고 여기서 잠근다.
CREATE OR REPLACE FUNCTION public.approve_gthr_application(
  p_gthr_id      uuid,
  p_mem_id       uuid,
  p_team_id      uuid,
  p_actor_mem_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_st  text;
  v_cnt int;
BEGIN
  -- 같은 모임에 대한 동시 승인을 직렬화한다. team_id 필터는 IDOR 방어(gthr_id 는 클라 입력).
  SELECT max_prt_cnt INTO v_max
  FROM   public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT aply_st_cd INTO v_st
  FROM   public.gthr_aply_rel
  WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id
  FOR UPDATE;
  IF NOT FOUND      THEN RETURN 'no_application'; END IF;
  IF v_st = 'approved' THEN RETURN 'already';     END IF;
  IF v_st <> 'pending' THEN RETURN 'not_pending'; END IF;

  -- 정원은 "승인된 사람만 먹는다"(설계 §9-b). 대기 인원은 세지 않는다.
  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.gthr_attd_rel WHERE gthr_id = p_gthr_id;
    IF v_cnt >= v_max THEN RETURN 'full'; END IF;
  END IF;

  -- 이 INSERT 가 "확정"의 정의다 — 포인트 트리거·칭호·집계가 여기서 비로소 돈다.
  INSERT INTO public.gthr_attd_rel (gthr_id, mem_id)
  VALUES (p_gthr_id, p_mem_id)
  ON CONFLICT (gthr_id, mem_id) DO NOTHING;

  UPDATE public.gthr_aply_rel
  SET    aply_st_cd   = 'approved',
         rvw_by       = p_actor_mem_id,
         rvw_at       = now(),
         rvw_memo_txt = NULL          -- 이전 반려 사유가 남아 확정 옆에 붙지 않게
  WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.approve_gthr_application(uuid, uuid, uuid, uuid)
  IS '모임 참가 신청 승인: 모임 행 잠금 → 정원 재확인 → gthr_attd_rel INSERT → aply approved 를 한 트랜잭션에. service_role 전용.';

REVOKE ALL ON FUNCTION public.approve_gthr_application(uuid, uuid, uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.approve_gthr_application(uuid, uuid, uuid, uuid) TO service_role;


-- ── 2. cancel_gthr_application — 신청 취소 / 참가 취소 ──
--
-- 대기 중이면 신청만 내리고, 이미 확정이면 gthr_attd_rel 에서 빼고 취소 이력까지 남긴다.
-- 확정 취소를 cancel_gthr_attendance 와 aply UPDATE 로 나눠 부르면 둘 사이에서 죽었을 때
-- "참석은 빠졌는데 신청은 확정으로 남은" 행이 생긴다.
CREATE OR REPLACE FUNCTION public.cancel_gthr_application(
  p_gthr_id      uuid,
  p_mem_id       uuid,
  p_team_id      uuid,
  p_actor_cd     text,
  p_actor_mem_id uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st     text;
  v_reason text;
BEGIN
  IF p_actor_cd NOT IN ('self', 'admin') THEN
    RAISE EXCEPTION 'actor_cd 는 self|admin 만 허용: %', p_actor_cd;
  END IF;

  PERFORM 1 FROM public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT aply_st_cd INTO v_st
  FROM   public.gthr_aply_rel
  WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- 신청 행이 없는데 참석 행만 있는 경우 — 승인제를 켜기 전에 참석했거나 백필이
    -- 어긋난 사람이다. 참석만 지우고 끝내면 다음에 신청도 못 하고 목록에도 안 보이는
    -- 어중간한 상태가 되므로, 취소된 신청 행을 만들어 상태를 맞춘 뒤 진행한다.
    IF NOT EXISTS (
      SELECT 1 FROM public.gthr_attd_rel WHERE gthr_id = p_gthr_id AND mem_id = p_mem_id
    ) THEN
      RETURN 'no_application';
    END IF;
    v_st := 'approved';
    INSERT INTO public.gthr_aply_rel (gthr_id, mem_id, aply_st_cd)
    VALUES (p_gthr_id, p_mem_id, 'approved')
    ON CONFLICT (gthr_id, mem_id) DO NOTHING;
  ELSIF v_st NOT IN ('pending', 'approved') THEN
    RETURN 'not_active';
  END IF;

  -- 빈 문자열/공백은 사유 없음(NULL)으로 정규화 — cancel_gthr_attendance 와 같은 규칙.
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

  IF v_st = 'approved' THEN
    -- 확정이었으니 자리를 반납한다. 이력은 기존 취소 이력 테이블에 그대로 쌓아
    -- 모임 상세의 "취소한 사람" 표시가 승인제 모임에서도 똑같이 동작하게 한다.
    DELETE FROM public.gthr_attd_rel
    WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id;

    INSERT INTO public.gthr_attd_hist (gthr_id, mem_id, evt_cd, actor_cd, actor_mem_id, reason_txt)
    VALUES (p_gthr_id, p_mem_id, 'cancel', p_actor_cd, p_actor_mem_id, v_reason);
  END IF;

  UPDATE public.gthr_aply_rel
  SET    aply_st_cd   = 'canceled',
         rvw_by       = CASE WHEN p_actor_cd = 'admin' THEN p_actor_mem_id ELSE rvw_by END,
         rvw_at       = CASE WHEN p_actor_cd = 'admin' THEN now()          ELSE rvw_at END,
         rvw_memo_txt = v_reason
  WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.cancel_gthr_application(uuid, uuid, uuid, text, uuid, text)
  IS '모임 참가 신청/확정 취소. 확정이었으면 gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT 까지 원자적으로. service_role 전용.';

REVOKE ALL ON FUNCTION public.cancel_gthr_application(uuid, uuid, uuid, text, uuid, text) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_gthr_application(uuid, uuid, uuid, text, uuid, text) TO service_role;


-- ── 3. admin_add_gthr_attendance — 운영진 대리 참석 추가 ──
--
-- 승인제 모임에서 gthr_attd_rel 에만 넣으면 신청 관리 목록에 안 보이는 유령 확정자가
-- 생긴다. 참여조건이 하드 게이트라 **이 문이 조건 미달자의 유일한 예외 구제 경로**이기도
-- 하다. 정원은 보지 않는다 — 기존 addGatheringAttendance 가 그랬고, 운영진 오버라이드가
-- 정원에 막히면 구제 경로 자체가 성립하지 않는다.
CREATE OR REPLACE FUNCTION public.admin_add_gthr_attendance(
  p_gthr_id      uuid,
  p_mem_id       uuid,
  p_team_id      uuid,
  p_actor_mem_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aprv boolean;
BEGIN
  SELECT aprv_req_yn INTO v_aprv
  FROM   public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  INSERT INTO public.gthr_attd_rel (gthr_id, mem_id)
  VALUES (p_gthr_id, p_mem_id)
  ON CONFLICT (gthr_id, mem_id) DO NOTHING;

  IF v_aprv THEN
    INSERT INTO public.gthr_aply_rel (gthr_id, mem_id, aply_st_cd, rvw_by, rvw_at)
    VALUES (p_gthr_id, p_mem_id, 'approved', p_actor_mem_id, now())
    ON CONFLICT (gthr_id, mem_id) DO UPDATE
      SET aply_st_cd   = 'approved',
          rvw_by       = EXCLUDED.rvw_by,
          rvw_at       = EXCLUDED.rvw_at,
          rvw_memo_txt = NULL;
  END IF;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.admin_add_gthr_attendance(uuid, uuid, uuid, uuid)
  IS '운영진 대리 참석 추가. 승인제 모임이면 gthr_aply_rel 에 approved 행도 함께 만든다(정원·참여조건 무시). service_role 전용.';

REVOKE ALL ON FUNCTION public.admin_add_gthr_attendance(uuid, uuid, uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_gthr_attendance(uuid, uuid, uuid, uuid) TO service_role;


-- ── 4. backfill_gthr_approvals — 기존 참석자를 확정 신청으로 ──
--
-- 두 자리에서 쓴다:
--   ① 이미 참석자가 있는 모임에 승인제를 켤 때(updateGathering)
--   ② 모임 개설 직후 개설자 자동 참석 뒤(createGathering) — 안 하면 모임을 만든
--      사람 자신이 상태 없는 유령이 되어 정원엔 잡히는데 신청 관리 목록엔 안 보인다.
-- 멱등하다. 이미 approved 인 행은 건드리지 않아 원래 승인자·승인시각이 보존된다.
CREATE OR REPLACE FUNCTION public.backfill_gthr_approvals(
  p_gthr_id      uuid,
  p_team_id      uuid,
  p_actor_mem_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnt int;
BEGIN
  PERFORM 1 FROM public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.gthr_aply_rel (gthr_id, mem_id, aply_st_cd, rvw_by, rvw_at)
  SELECT ar.gthr_id, ar.mem_id, 'approved', p_actor_mem_id, now()
  FROM   public.gthr_attd_rel ar
  WHERE  ar.gthr_id = p_gthr_id
  ON CONFLICT (gthr_id, mem_id) DO UPDATE
    SET aply_st_cd   = 'approved',
        rvw_by       = EXCLUDED.rvw_by,
        rvw_at       = EXCLUDED.rvw_at,
        rvw_memo_txt = NULL
    WHERE gthr_aply_rel.aply_st_cd <> 'approved';

  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN v_cnt;
END;
$$;

COMMENT ON FUNCTION public.backfill_gthr_approvals(uuid, uuid, uuid)
  IS '해당 모임의 기존 gthr_attd_rel 참석자를 gthr_aply_rel approved 로 채운다(멱등). 승인제 켜기·개설자 자동참석 뒤에 호출. service_role 전용.';

REVOKE ALL ON FUNCTION public.backfill_gthr_approvals(uuid, uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.backfill_gthr_approvals(uuid, uuid, uuid) TO service_role;

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.backfill_gthr_approvals(uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.admin_add_gthr_attendance(uuid, uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.cancel_gthr_application(uuid, uuid, uuid, text, uuid, text);
-- DROP FUNCTION IF EXISTS public.approve_gthr_application(uuid, uuid, uuid, uuid);
-- ============================================================
