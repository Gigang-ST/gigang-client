-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- cancel_gthr_attendance — 반환형 uuid[] → jsonb {promoted, notify_open_seat}
--   PR #532 리뷰 반영
--
-- 왜: 빈 자리 알림(gthr_seat)을 보낼지 앱이 "시작 2시간 전인가"만 보고 정했다. 두 가지가 틀렸다.
--   ① **실제 빈자리를 안 봤다.** 운영진이 정원을 넘겨 넣은 모임(22/20)에서 한 명이 취소하면
--      21/20 으로 여전히 만석인데 대기자 전원에게 "빈 자리가 났어요"가 갔고, 1회 제한 때문에
--      정작 19명이 됐을 때의 진짜 알림이 나가지 않았다.
--   ② **판정 시각이 갈렸다.** 승급 게이트는 트랜잭션 안의 now(), 알림 판정은 앱 서버의 시계라
--      2시간 경계 직전에 승급이 일어난 뒤 앱이 "선착순 구간"으로 보고 알림을 보낼 수 있었다.
--
-- 그래서 알림 여부를 **같은 트랜잭션 안에서** 하나의 값으로 계산해 돌려준다. now() 는 트랜잭션
-- 시작 시각으로 고정이라 promote_gthr_waitlist 의 게이트와 같은 시각으로 판정된다.
-- 두 호출부(본인 취소·운영진 제거)가 조건을 각자 조립하지 않도록 boolean 하나로 준다.
--
-- 반환형이 바뀌므로 CREATE OR REPLACE 가 아니라 DROP 후 재생성한다.
-- 앱의 파서(lib/gathering/cancel-result.ts)는 옛 uuid[] 응답도 받으므로 배포 순서가
-- 뒤집혀도 승급 알림은 끊기지 않는다(빈 자리 알림만 그 사이 나가지 않는다).
-- ============================================================

DROP FUNCTION IF EXISTS public.cancel_gthr_attendance(uuid, uuid, text, uuid, text);

CREATE FUNCTION public.cancel_gthr_attendance(
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
  v_max      int;
  v_aprv     boolean;
  v_openall  boolean;
  v_live     boolean;
  v_cnt      int;
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
  --    조건은 promote 의 게이트를 그대로 뒤집은 것 + "실제로 자리가 비었는가".
  SELECT max_prt_cnt,
         aprv_req_yn,
         stt_at - now() < interval '2 hours',
         COALESCE(end_at, stt_at) > now()
    INTO v_max, v_aprv, v_openall, v_live
  FROM public.gthr_mst
  WHERE gthr_id = p_gthr_id;

  SELECT COUNT(*) INTO v_cnt FROM public.gthr_attd_rel WHERE gthr_id = p_gthr_id;

  RETURN jsonb_build_object(
    'promoted', to_jsonb(COALESCE(v_promoted, ARRAY[]::uuid[])),
    'notify_open_seat',
      COALESCE(NOT v_aprv AND v_max IS NOT NULL AND v_openall AND v_live AND v_cnt < v_max, false)
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text)
  IS '참석 취소를 원자적으로: gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT + 대기열 승급. {promoted: uuid[], notify_open_seat: boolean} 반환 — notify_open_seat 는 같은 트랜잭션 시각 기준으로 선착순 구간이면서 실제 빈자리가 있을 때만 true. service_role 전용.';

REVOKE ALL ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) TO service_role;

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.cancel_gthr_attendance(uuid, uuid, text, uuid, text);
-- 그 뒤 20260910110000_gthr_wait_rpcs.sql 의 cancel_gthr_attendance(RETURNS uuid[])를 다시 만든다.
-- ============================================================
