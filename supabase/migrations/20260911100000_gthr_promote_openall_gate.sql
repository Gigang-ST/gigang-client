-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- 모임 대기열 — 시작 2시간 전부터 자동 승급 중단
--   설계: docs/superpowers/specs/2026-09-11-모임-대기열-임박구간-design.md §2
--
-- 왜: 모임이 코앞이면 "가장 오래 기다린 사람"보다 **지금 올 수 있는 사람**이 중요하다.
--     대기 1번이 알림을 못 보면 자리는 빈 채로 모임이 시작된다. 그래서 이 구간엔 줄을
--     당기지 않고 선착순으로 연다 — 대신 앱이 대기자 전원에게 gthr_seat 알림을 보낸다
--     (안 보내면 자동 승급도 알림도 없어져 지금보다 나빠진다).
--
-- ⚠️ 값(2시간)을 TS 쪽 GATHERING_WAITLIST_OPEN_HOURS 와 **각자 들고 있다.** SQL 이 TS
--    상수를 읽을 수 없어 생기는 중복이므로, 한쪽을 바꾸면 반드시 다른 쪽도 바꾼다.
--
-- ⚠️ 반환값(빈 배열)만으로는 "올릴 사람이 없었다"와 "선착순 구간이라 안 올렸다"가
--    구분되지 않는다. 호출부(TS)가 stt_at 을 이미 들고 있으므로 isWaitlistOpenToAll 로
--    스스로 판정해 알림을 보낸다 — RPC 시그니처를 바꾸면 호출부 셋이 전부 따라 움직인다.
--
-- 20260910110000_gthr_wait_rpcs.sql 의 본문에 게이트 하나만 더한 것이다(나머지 동일).
-- ============================================================

CREATE OR REPLACE FUNCTION public.promote_gthr_waitlist(
  p_gthr_id uuid,
  p_team_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max      int;
  v_aprv     boolean;
  v_open     boolean;
  v_openall  boolean;
  v_cnt      int;
  v_promoted uuid[] := ARRAY[]::uuid[];
  r          record;
BEGIN
  -- team_id 필터는 IDOR 방어(gthr_id 는 클라 입력에서 출발한다).
  SELECT max_prt_cnt,
         aprv_req_yn,
         COALESCE(end_at, stt_at) > now(),
         stt_at - now() < interval '2 hours'
    INTO v_max, v_aprv, v_open, v_openall
  FROM   public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN v_promoted; END IF;

  -- 승인제는 운영진이 고른다(대기열을 붙이지 않는다). 방어적 재확인.
  IF v_aprv THEN RETURN v_promoted; END IF;
  -- 정원 없는 모임엔 대기열 개념이 없다.
  IF v_max IS NULL THEN RETURN v_promoted; END IF;
  -- 이미 시작·종료한 모임엔 시스템이 사람을 자동으로 밀어 넣지 않는다.
  -- 이건 isPastLockedFor(KST 날짜 기준)의 복제가 아니라 **더 보수적인 독립 게이트**다:
  -- 실제로 뛰지 않은 사람에게 포인트 트리거가 도는 것을 막는 게 목적이다.
  IF NOT v_open THEN RETURN v_promoted; END IF;
  -- 시작 2시간 전부터는 선착순 구간 — 줄을 당기지 않는다(위 헤더 주석 참고).
  IF v_openall THEN RETURN v_promoted; END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.gthr_attd_rel WHERE gthr_id = p_gthr_id;

  FOR r IN
    SELECT w.wait_id, w.mem_id
    FROM   public.gthr_wait_rel w
    WHERE  w.gthr_id = p_gthr_id AND w.wait_st_cd = 'waiting'
    ORDER  BY w.wait_at, w.wait_id
    FOR UPDATE
  LOOP
    EXIT WHEN v_cnt >= v_max;

    -- 이미 참석자다(운영진이 우겨넣었다) → 대기 행만 닫고 **자리는 쓰지 않은 채**
    -- 다음 사람을 본다. 여기서 v_cnt 를 올리면 빈자리가 하나 증발한다.
    IF EXISTS (
      SELECT 1 FROM public.gthr_attd_rel a
      WHERE  a.gthr_id = p_gthr_id AND a.mem_id = r.mem_id
    ) THEN
      UPDATE public.gthr_wait_rel
      SET    wait_st_cd = 'promoted', upd_at = now()
      WHERE  wait_id = r.wait_id;
      CONTINUE;
    END IF;

    -- 탈퇴·비활성은 건너뛴다. 대기 행은 waiting 그대로 둔다 — 재활성되면 다시 후보다.
    -- (닫아 버리면 복귀한 사람이 영문도 모르고 줄에서 사라진다.)
    IF NOT EXISTS (
      SELECT 1 FROM public.team_mem_rel t
      WHERE  t.mem_id = r.mem_id AND t.team_id = p_team_id
        AND  t.vers = 0 AND t.del_yn = false AND t.mem_st_cd = 'active'
    ) THEN
      CONTINUE;
    END IF;

    -- 이 INSERT 가 "확정"의 정의다 — 포인트 트리거·집계가 여기서 비로소 돈다.
    INSERT INTO public.gthr_attd_rel (gthr_id, mem_id)
    VALUES (p_gthr_id, r.mem_id)
    ON CONFLICT (gthr_id, mem_id) DO NOTHING;

    UPDATE public.gthr_wait_rel
    SET    wait_st_cd = 'promoted', upd_at = now()
    WHERE  wait_id = r.wait_id;

    v_cnt      := v_cnt + 1;
    v_promoted := v_promoted || r.mem_id;
  END LOOP;

  RETURN v_promoted;
END;
$$;

COMMENT ON FUNCTION public.promote_gthr_waitlist(uuid, uuid)
  IS '비승인제 모임의 빈자리만큼 대기자를 wait_at 순으로 참석 확정시킨다. 시작 2시간 전부터는 선착순 구간이라 아무도 올리지 않는다(앱이 대기자에게 gthr_seat 알림을 보낸다). 승급된 mem_id 배열 반환. service_role 전용.';

REVOKE ALL ON FUNCTION public.promote_gthr_waitlist(uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.promote_gthr_waitlist(uuid, uuid) TO service_role;

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- 20260910110000_gthr_wait_rpcs.sql 의 promote_gthr_waitlist 본문으로 되돌린다
-- (v_openall 선언과 `IF v_openall THEN RETURN v_promoted; END IF;` 만 제거하면 된다).
-- ============================================================
