-- 노쇼 처리 — 모임 참석 빼기 + 사유 기록 (#759)
--
-- 노쇼 = 참석을 눌러 놓고 오지 않은 사람을 운영진이 참석에서 뺀 것. 새 테이블을 만들지 않고 기존 취소 이력
-- (gthr_attd_hist)에 **노쇼 표시**만 얹는다 — 누가·언제·어떤 사유로 뺐는지(actor_mem_id·evt_at·reason_txt)는
-- 이미 그 테이블이 들고 있고, 취소 목록·재참석 판정(derive-canceled-attendees)이 그대로 동작한다.
--   - 참석 행(gthr_attd_rel)을 지우므로 출석·PB클래스 집계(참석 행을 센다)는 빠진 참석을 세지 않는다.
--   - 회원별 노쇼 횟수 = noshow_yn 인 이력 행 수.
--
-- 원자성: 기존 취소 RPC 두 개(cancel_gthr_attendance · cancel_gthr_application)를 **다시 쓰지 않고** 감싼다.
--   감싼 RPC 가 취소를 부른 뒤 같은 트랜잭션에서 방금 쌓인 취소 이력에 noshow_yn 을 켠다.
--   service_role 전용 — 앱은 관리자 세션을 확인한 서버 액션/MCP 에서만 부른다.

ALTER TABLE public.gthr_attd_hist
  ADD COLUMN IF NOT EXISTS noshow_yn boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.gthr_attd_hist.noshow_yn IS '운영진이 노쇼로 처리해 뺀 취소인가(#759). 사유는 reason_txt, 처리한 운영진은 actor_mem_id, 시각은 evt_at.';

-- 회원별 노쇼 횟수 집계용(노쇼 행은 드물어 부분 인덱스)
CREATE INDEX IF NOT EXISTS ix_gthr_attd_hist_noshow
  ON public.gthr_attd_hist (mem_id)
  WHERE noshow_yn;

CREATE OR REPLACE FUNCTION public.noshow_gthr_attendance(
  p_gthr_id      uuid,
  p_mem_id       uuid,
  p_team_id      uuid,
  p_actor_mem_id uuid,
  p_reason       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
  v_aprv   boolean;
  v_res    jsonb;
  v_status text;
BEGIN
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION '노쇼 처리에는 사유가 필요합니다';
  END IF;

  SELECT aprv_req_yn INTO v_aprv
  FROM   public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gthr_attd_rel WHERE gthr_id = p_gthr_id AND mem_id = p_mem_id
  ) THEN
    RETURN jsonb_build_object('status', 'not_attending');
  END IF;

  IF v_aprv THEN
    -- 승인제 — 신청 행(gthr_aply_rel)까지 canceled 로 정리해야 유령 확정자가 안 남는다.
    v_status := public.cancel_gthr_application(p_gthr_id, p_mem_id, p_team_id, 'admin', p_actor_mem_id, v_reason);
    IF v_status <> 'ok' THEN
      RETURN jsonb_build_object('status', v_status);
    END IF;
    v_res := jsonb_build_object('promoted', '[]'::jsonb, 'notify_open_seat', false);
  ELSE
    v_res := public.cancel_gthr_attendance(p_gthr_id, p_mem_id, 'admin', p_actor_mem_id, v_reason);
  END IF;

  -- 방금 같은 트랜잭션에서 쌓인 취소 이력(가장 최근 것)에 노쇼 표시.
  UPDATE public.gthr_attd_hist
  SET    noshow_yn = true
  WHERE  hist_id = (
    SELECT hist_id FROM public.gthr_attd_hist
    WHERE  gthr_id = p_gthr_id AND mem_id = p_mem_id AND evt_cd = 'cancel'
    ORDER  BY evt_at DESC
    LIMIT  1
  );

  RETURN COALESCE(v_res, '{}'::jsonb) || jsonb_build_object('status', 'ok');
END;
$$;

COMMENT ON FUNCTION public.noshow_gthr_attendance(uuid, uuid, uuid, uuid, text)
  IS '노쇼 처리: 참석 취소(RPC 재사용, actor=admin) + 방금 쌓인 취소 이력에 noshow_yn 표시를 한 트랜잭션으로. 사유 필수. {status: ok|not_found|not_attending|…, promoted, notify_open_seat} 반환. service_role 전용.';

REVOKE ALL ON FUNCTION public.noshow_gthr_attendance(uuid, uuid, uuid, uuid, text) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.noshow_gthr_attendance(uuid, uuid, uuid, uuid, text) TO service_role;

-- REVERT: DROP FUNCTION public.noshow_gthr_attendance(uuid, uuid, uuid, uuid, text);
--         DROP INDEX public.ix_gthr_attd_hist_noshow;
--         ALTER TABLE public.gthr_attd_hist DROP COLUMN noshow_yn;
