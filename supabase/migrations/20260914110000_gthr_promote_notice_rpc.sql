-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- 모임 대기열 — 빈 자리 알림 판정 헬퍼 + 정원 증가용 승급 RPC
--   PR #532 대기 로직 점검 반영
--
-- 왜: 정원을 늘리는 경로(updateGathering)가 promote_gthr_waitlist 를 직접 불렀다. 선착순 구간
--     (시작 2시간 전~)이면 promote 는 게이트에 걸려 빈 배열만 돌려주고, 앱은 빈 자리 알림을
--     보내지 않았다. 시작 1시간 전에 정원을 20→25 로 늘리면 대기자 5명이 모른 채 자리가 빈 채로
--     모임이 시작된다 — 취소 경로에서 고친 것과 같은 문제가 형제 경로에 남아 있었다.
--
-- 그래서 "빈 자리 알림을 보낼 상태인가"를 **SQL 헬퍼 하나**로 빼고, 대기열을 움직이는 두 RPC
-- (cancel_gthr_attendance · promote_gthr_waitlist_notice)가 같은 헬퍼를 쓴다. 조건을 RPC 마다
-- 적으면 한쪽만 바뀐다. now() 는 트랜잭션 시작 시각으로 고정이라 promote 의 게이트와 같은
-- 시각으로 판정된다.
--
-- ⚠️ 2시간 값은 TS 의 GATHERING_WAITLIST_OPEN_HOURS · promote_gthr_waitlist 와 **각자 들고 있다.**
--    한쪽을 바꾸면 셋 다 바꾼다.
-- ============================================================


-- ── 1. gthr_open_seat_notice_yn — 빈 자리 알림을 보낼 상태인가 ──
--
-- promote_gthr_waitlist 의 게이트를 뒤집은 조건 + "실제로 자리가 비었는가".
-- team_id 를 함께 받는 이유: 호출부가 gthr_id 만으로 판정하면 다른 팀 모임 id 로 그 팀
-- 대기자에게 알림을 보내게 만들 수 있다(promote 의 IDOR 방어와 같은 태도).
-- 행이 없으면 NULL 이 온다 — 호출부가 COALESCE(…, false) 로 받는다.
CREATE OR REPLACE FUNCTION public.gthr_open_seat_notice_yn(
  p_gthr_id uuid,
  p_team_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT g.aprv_req_yn
         AND g.max_prt_cnt IS NOT NULL
         AND g.stt_at - now() < interval '2 hours'
         AND COALESCE(g.end_at, g.stt_at) > now()
         AND (SELECT COUNT(*) FROM public.gthr_attd_rel a WHERE a.gthr_id = g.gthr_id) < g.max_prt_cnt
  FROM public.gthr_mst g
  WHERE g.gthr_id = p_gthr_id
    AND g.team_id = p_team_id
    AND g.del_yn = false;
$$;

COMMENT ON FUNCTION public.gthr_open_seat_notice_yn(uuid, uuid)
  IS '선착순 구간(시작 2시간 전~)이면서 실제 빈자리가 있는 비승인제 모임인가. 대기열을 움직이는 RPC 들이 빈 자리 알림 여부 판정에 공유한다. 모임이 없거나 팀이 다르면 NULL. service_role 전용.';

REVOKE ALL ON FUNCTION public.gthr_open_seat_notice_yn(uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.gthr_open_seat_notice_yn(uuid, uuid) TO service_role;


-- ── 2. cancel_gthr_attendance — 판정을 헬퍼로 교체(반환형 동일) ──
CREATE OR REPLACE FUNCTION public.cancel_gthr_attendance(
  p_gthr_id      uuid,
  p_mem_id       uuid,
  p_actor_cd     text,
  p_actor_mem_id uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted  int;
  v_reason   text;
  v_team     uuid;
  v_promoted uuid[];
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

  SELECT team_id INTO v_team FROM public.gthr_mst WHERE gthr_id = p_gthr_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('promoted', '[]'::jsonb, 'notify_open_seat', false);
  END IF;

  -- ③ 자리가 났으니 대기열을 당긴다(선착순 구간이면 promote 가 스스로 아무도 안 올린다).
  v_promoted := public.promote_gthr_waitlist(p_gthr_id, v_team);

  -- ④ 빈 자리 알림 판정 — promote 가 모임 행을 FOR UPDATE 로 잠근 뒤라 일관된 값이다.
  RETURN jsonb_build_object(
    'promoted', to_jsonb(COALESCE(v_promoted, ARRAY[]::uuid[])),
    'notify_open_seat', COALESCE(public.gthr_open_seat_notice_yn(p_gthr_id, v_team), false)
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text)
  IS '참석 취소를 원자적으로: gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT + 대기열 승급. {promoted: uuid[], notify_open_seat: boolean} 반환 — notify_open_seat 는 gthr_open_seat_notice_yn 판정. service_role 전용.';

REVOKE ALL ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) TO service_role;


-- ── 3. promote_gthr_waitlist_notice — 정원 증가용: 승급 + 빈 자리 알림 판정 ──
--
-- promote_gthr_waitlist 는 uuid[] 그대로 둔다(취소 RPC 가 내부에서 부른다). 앱이 정원을 늘린 뒤
-- 부르는 입구만 따로 두어, 취소 RPC 와 **같은 모양**({promoted, notify_open_seat})을 돌려준다 —
-- 앱은 같은 파서(parseCancelResult)와 같은 뒷처리(runPromotionFollowups)를 쓴다.
CREATE OR REPLACE FUNCTION public.promote_gthr_waitlist_notice(
  p_gthr_id uuid,
  p_team_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promoted uuid[];
BEGIN
  v_promoted := public.promote_gthr_waitlist(p_gthr_id, p_team_id);

  RETURN jsonb_build_object(
    'promoted', to_jsonb(COALESCE(v_promoted, ARRAY[]::uuid[])),
    'notify_open_seat', COALESCE(public.gthr_open_seat_notice_yn(p_gthr_id, p_team_id), false)
  );
END;
$$;

COMMENT ON FUNCTION public.promote_gthr_waitlist_notice(uuid, uuid)
  IS '정원 증가 등으로 대기열을 당긴다. promote_gthr_waitlist 결과와 빈 자리 알림 여부를 {promoted, notify_open_seat} 로 반환(cancel_gthr_attendance 와 같은 모양). service_role 전용.';

REVOKE ALL ON FUNCTION public.promote_gthr_waitlist_notice(uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.promote_gthr_waitlist_notice(uuid, uuid) TO service_role;

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.promote_gthr_waitlist_notice(uuid, uuid);
-- 20260914100000_gthr_cancel_result_jsonb.sql 의 cancel_gthr_attendance 본문(인라인 판정)으로 되돌린 뒤
-- DROP FUNCTION IF EXISTS public.gthr_open_seat_notice_yn(uuid, uuid);
-- ============================================================
