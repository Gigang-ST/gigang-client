-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- 모임 대기열 — 상태 전이 RPC
--   설계: docs/superpowers/specs/2026-09-10-모임-대기열-design.md §3·§4·§5
--
-- 전부 service_role 전용(SECURITY DEFINER). 참여조건 판정은 여기 없다 —
-- 정본은 lib/gathering/join-condition.ts 한 곳이고, 앱 서버가 그 게이트를
-- 통과시킨 뒤에만 이 함수들을 부른다. SQL 에 조건을 한 벌 더 구현하면 진실이 둘이 된다.
-- 같은 이유로 "지난 모임 잠금"(isPastLockedFor, KST 날짜 기준 + 관리자 예외)도
-- join_gthr_or_wait 에 넣지 않는다 — promote 쪽의 시각 게이트는 그 규칙의
-- 복제가 아니라 성격이 다른 독립 규칙이다(아래 주석 참고).
-- ============================================================


-- ── 1. promote_gthr_waitlist — 빈자리만큼 대기자를 올린다 ──
--
-- 1명 취소든 정원을 20→25 로 늘리든 같은 함수가 처리한다.
-- 모임 행을 FOR UPDATE 로 잠가 동시 취소를 직렬화한다.
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
  v_cnt      int;
  v_promoted uuid[] := ARRAY[]::uuid[];
  r          record;
BEGIN
  -- team_id 필터는 IDOR 방어(gthr_id 는 클라 입력에서 출발한다).
  SELECT max_prt_cnt,
         aprv_req_yn,
         COALESCE(end_at, stt_at) > now()
    INTO v_max, v_aprv, v_open
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
  -- 사람이 판단해 넣는 것(admin_add_gthr_attendance)과는 다른 일이다.
  IF NOT v_open THEN RETURN v_promoted; END IF;

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
  IS '비승인제 모임의 빈자리만큼 대기자를 wait_at 순으로 참석 확정시킨다. 승급된 mem_id 배열 반환. service_role 전용.';

REVOKE ALL ON FUNCTION public.promote_gthr_waitlist(uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.promote_gthr_waitlist(uuid, uuid) TO service_role;


-- ── 2. join_gthr_or_wait — 자리가 있으면 참석, 없으면 대기 ──
--
-- joinGatheringWithCapCheck 의 정원 체크는 COUNT → upsert 2단계라 원자적이지 않았다
-- (TOCTOU). 만석 직전에 두 명이 동시에 누르면 21명이 됐다. 대기열이 붙으면 그 사고로
-- 넘친 1명이 대기열을 이유 없이 얼리므로(승급 규칙이 COUNT < max 하나뿐이라서)
-- 여기서 잠근다.
--
-- 지난 모임 잠금은 여기 없다 — 판정 정본은 isPastLockedFor(KST 날짜 기준, 관리자
-- 예외)이고 호출부가 이미 통과시킨다. SQL 에 now() 비교를 넣으면 "오늘 저녁 모임이
-- 2시간 전에 시작했지만 KST 같은 날이라 아직 열려 있다"를 잘못 막는다.
CREATE OR REPLACE FUNCTION public.join_gthr_or_wait(
  p_gthr_id uuid,
  p_mem_id  uuid,
  p_team_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_cnt int;
BEGIN
  SELECT max_prt_cnt INTO v_max
  FROM   public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- 이미 참석자면 멱등하게 성공.
  IF EXISTS (
    SELECT 1 FROM public.gthr_attd_rel
    WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id
  ) THEN
    RETURN 'joined';
  END IF;

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.gthr_attd_rel WHERE gthr_id = p_gthr_id;

    IF v_cnt >= v_max THEN
      -- 대기열로. 이미 waiting 이면 순번을 유지하고(연타로 자기 순번을 뒤로 미는
      -- 사고 방지), promoted·canceled 에서 돌아오는 경우에만 wait_at 을 now() 로
      -- 갱신해 **맨 뒤**로 보낸다(스스로 자리를 비웠다 돌아온 사람이 그 사이
      -- 기다린 사람을 제치면 선착순이 아니다).
      INSERT INTO public.gthr_wait_rel (gthr_id, mem_id, wait_st_cd, wait_at)
      VALUES (p_gthr_id, p_mem_id, 'waiting', now())
      ON CONFLICT (gthr_id, mem_id) DO UPDATE
        SET wait_st_cd = 'waiting',
            wait_at    = CASE WHEN gthr_wait_rel.wait_st_cd = 'waiting'
                              THEN gthr_wait_rel.wait_at
                              ELSE now() END,
            upd_at     = now();
      RETURN 'waiting';
    END IF;
  END IF;

  INSERT INTO public.gthr_attd_rel (gthr_id, mem_id)
  VALUES (p_gthr_id, p_mem_id)
  ON CONFLICT (gthr_id, mem_id) DO NOTHING;

  -- 자리가 나서 직접 들어왔으면 남아 있던 대기 행을 닫는다(참석자이자 대기자인 유령 방지).
  UPDATE public.gthr_wait_rel
  SET    wait_st_cd = 'promoted', upd_at = now()
  WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id AND wait_st_cd = 'waiting';

  RETURN 'joined';
END;
$$;

COMMENT ON FUNCTION public.join_gthr_or_wait(uuid, uuid, uuid)
  IS '모임 참석 등록: 모임 행 잠금 → 자리 있으면 gthr_attd_rel INSERT(joined), 없으면 gthr_wait_rel 대기 등록(waiting). service_role 전용.';

REVOKE ALL ON FUNCTION public.join_gthr_or_wait(uuid, uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.join_gthr_or_wait(uuid, uuid, uuid) TO service_role;


-- ── 3. cancel_gthr_attendance — 취소 + 승급을 한 트랜잭션으로 ──
--
-- 반환형이 void → uuid[] 로 바뀌므로 CREATE OR REPLACE 가 아니라 DROP 후 재생성해야 한다.
--
-- 왜 승급을 여기 넣는가: 서버 액션에서 "취소 RPC → 그다음 승급 RPC"로 나눠 부르면
--   ① 두 명이 동시에 취소할 때 둘 다 같은 대기 1번을 올리려 하고
--   ② 두 호출 사이에서 죽으면 자리가 빈 채로 영영 남는다(다음 취소 전까지 아무도 안 올라간다).
DROP FUNCTION IF EXISTS public.cancel_gthr_attendance(uuid, uuid, text, uuid, text);

CREATE FUNCTION public.cancel_gthr_attendance(
  p_gthr_id      uuid,
  p_mem_id       uuid,
  p_actor_cd     text,
  p_actor_mem_id uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
  v_reason  text;
  v_team    uuid;
BEGIN
  IF p_actor_cd NOT IN ('self', 'admin') THEN
    RAISE EXCEPTION 'actor_cd 는 self|admin 만 허용: %', p_actor_cd;
  END IF;

  -- ① 현재상태(gthr_attd_rel) 행 삭제
  DELETE FROM public.gthr_attd_rel
  WHERE gthr_id = p_gthr_id AND mem_id = p_mem_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION '참석 기록이 없습니다';
  END IF;

  -- 빈 문자열/공백은 사유 없음(NULL)으로 정규화. 길이 상한(<=500)은 컬럼 CHECK 가 강제.
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

  -- ② 취소 이벤트 이력 append
  INSERT INTO public.gthr_attd_hist (gthr_id, mem_id, evt_cd, actor_cd, actor_mem_id, reason_txt)
  VALUES (p_gthr_id, p_mem_id, 'cancel', p_actor_cd, p_actor_mem_id, v_reason);

  -- ③ 자리가 났으니 대기열을 당긴다. team_id 는 여기서 끌어온다 — 호출부가 이미
  --    팀 소속을 검증하고 부르므로 인자를 늘리지 않는다.
  SELECT team_id INTO v_team FROM public.gthr_mst WHERE gthr_id = p_gthr_id;
  IF v_team IS NULL THEN RETURN ARRAY[]::uuid[]; END IF;

  RETURN public.promote_gthr_waitlist(p_gthr_id, v_team);
END;
$$;

COMMENT ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text)
  IS '참석 취소를 원자적으로: gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT + 대기열 승급. 승급된 mem_id 배열 반환. service_role 전용.';

REVOKE ALL ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) TO service_role;


-- ── 4. admin_add_gthr_attendance — 대기 행 정리 추가 ──
--
-- 기존 동작(정원·참여조건 무시)은 그대로다. 대기자를 운영진이 직접 넣었을 때
-- waiting 행이 남으면 참석자이면서 대기자인 유령이 되어 promote 가 그 자리를
-- 헛돌게 만든다.
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

  -- 대기 중이던 사람을 운영진이 직접 넣은 경우 — 대기 행을 닫는다.
  UPDATE public.gthr_wait_rel
  SET    wait_st_cd = 'promoted', upd_at = now()
  WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id AND wait_st_cd = 'waiting';

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.admin_add_gthr_attendance(uuid, uuid, uuid, uuid)
  IS '운영진 대리 참석 추가. 승인제면 gthr_aply_rel approved 행도, 대기 중이었으면 gthr_wait_rel 을 promoted 로 닫는다(정원·참여조건 무시). service_role 전용.';

REVOKE ALL ON FUNCTION public.admin_add_gthr_attendance(uuid, uuid, uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_gthr_attendance(uuid, uuid, uuid, uuid) TO service_role;

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.join_gthr_or_wait(uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.cancel_gthr_attendance(uuid, uuid, text, uuid, text);
-- DROP FUNCTION IF EXISTS public.promote_gthr_waitlist(uuid, uuid);
-- 그 뒤 20260720100000_gthr_attd_hist.sql 의 cancel_gthr_attendance(RETURNS void)와
-- 20260825120000_gthr_aply_rpcs.sql 의 admin_add_gthr_attendance 를 다시 만든다.
-- ============================================================
