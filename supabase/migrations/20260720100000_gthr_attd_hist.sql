-- ============================================================
-- gthr_attd_hist — 모임 참석 취소 이력 (append-only)
-- 목적: 참석 취소를 gthr_attd_rel 에서 하드 삭제하던 것을 이력으로 남긴다.
--   현재상태 테이블(gthr_attd_rel)은 그대로 유지(UNIQUE(gthr_id,mem_id) 재등록 충돌 회피),
--   취소 이벤트만 이 이력 테이블에 append 한다. 취소 = rel DELETE + hist INSERT 는
--   원자적이어야 하므로 SECURITY DEFINER RPC(cancel_gthr_attendance)로 묶는다.
-- 노출 정책(오너 결정): 취소 이력(사유 포함) SELECT = 팀 멤버 전체 공개
--   (gthr_attd_rel_select 와 동일 수준). 비멤버·anon 차단. 컬럼 분리/뷰 불필요.
-- ============================================================

CREATE TABLE public.gthr_attd_hist (
  hist_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gthr_id      uuid        NOT NULL REFERENCES public.gthr_mst(gthr_id),
  mem_id       uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  evt_cd       text        NOT NULL DEFAULT 'cancel' CHECK (evt_cd IN ('register', 'cancel')),
  actor_kind   text        NOT NULL CHECK (actor_kind IN ('self', 'admin')),
  actor_mem_id uuid        REFERENCES public.mem_mst(mem_id),
  reason_txt   text,
  evt_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.gthr_attd_hist              IS '모임 참석 이벤트 이력 (append-only). 현재는 취소(cancel) 이벤트만 기록. 재참석은 gthr_attd_rel upsert 로 처리되며 이 이력은 보존된다.';
COMMENT ON COLUMN public.gthr_attd_hist.hist_id      IS 'PK';
COMMENT ON COLUMN public.gthr_attd_hist.gthr_id      IS '모임 ID (gthr_mst FK)';
COMMENT ON COLUMN public.gthr_attd_hist.mem_id       IS '대상 참석자 mem_id (mem_mst FK)';
COMMENT ON COLUMN public.gthr_attd_hist.evt_cd       IS '이벤트 종류: register|cancel. 현재 cancel 만 기록(register 로깅은 후속 과제).';
COMMENT ON COLUMN public.gthr_attd_hist.actor_kind   IS '취소 주체 구분: self(본인)|admin(관리자).';
COMMENT ON COLUMN public.gthr_attd_hist.actor_mem_id IS '실제 행위자 mem_id. self 면 mem_id 와 동일, admin 이면 처리한 관리자 mem_id.';
COMMENT ON COLUMN public.gthr_attd_hist.reason_txt   IS '취소 사유(nullable). SG-01 은 저장만, 필수 강제는 후속 SG-02.';
COMMENT ON COLUMN public.gthr_attd_hist.evt_at       IS '이벤트(취소) 발생 시각.';

-- 특정 모임의 취소 이력 조회용
CREATE INDEX ix_gthr_attd_hist_gthr ON public.gthr_attd_hist(gthr_id);
-- 특정 멤버의 취소 이력 조회용
CREATE INDEX ix_gthr_attd_hist_mem  ON public.gthr_attd_hist(mem_id);

-- ============================================================
-- RLS — SELECT 만 팀 멤버에게 허용. INSERT/UPDATE/DELETE 정책 없음
--   → authenticated 는 직접 쓰기 불가(append-only 불변). 쓰기는 SECURITY DEFINER
--   RPC(service_role, RLS 우회)만 수행.
-- ============================================================

ALTER TABLE public.gthr_attd_hist ENABLE ROW LEVEL SECURITY;

CREATE POLICY gthr_attd_hist_select ON public.gthr_attd_hist
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gthr_mst g
      WHERE g.gthr_id = gthr_attd_hist.gthr_id
        AND g.del_yn = false
        AND public.v2_rls_auth_in_team(g.team_id)
    )
  );

COMMENT ON POLICY gthr_attd_hist_select ON public.gthr_attd_hist
  IS '팀 멤버만 취소 이력(사유 포함) 조회. 비멤버·anon 차단.';

-- ============================================================
-- cancel_gthr_attendance — 참석 취소를 원자적으로 이력화하는 RPC
--   ① gthr_attd_rel 현재상태 행 DELETE → ② gthr_attd_hist 에 cancel 이벤트 INSERT.
--   한 트랜잭션(함수)으로 묶어 부분 실패 방지.
-- 보안: 앱의 모든 호출 경로가 service_role(createAdminClient/createUntypedAdminClient)이므로
--   service_role 에만 EXECUTE 를 주고 authenticated·anon 은 명시 회수한다.
--   (SECURITY DEFINER + `from public` 만으론 authenticated 명시 GRANT·기본 anon 이 남아
--    /rpc/ 직접 호출로 남의 참석을 취소하는 IDOR 가 열린다 — 사고 #425 전례.)
-- 인가(누가 취소할 자격이 있는지)는 호출부 서버 액션(withMember/withAdmin)에서 이미 검증한다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_gthr_attendance(
  p_gthr_id      uuid,
  p_mem_id       uuid,
  p_actor_kind   text,
  p_actor_mem_id uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
  v_reason  text;
BEGIN
  IF p_actor_kind NOT IN ('self', 'admin') THEN
    RAISE EXCEPTION 'actor_kind 는 self|admin 만 허용: %', p_actor_kind;
  END IF;

  -- ① 현재상태(gthr_attd_rel) 행 삭제
  DELETE FROM public.gthr_attd_rel
  WHERE gthr_id = p_gthr_id AND mem_id = p_mem_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION '참석 기록이 없습니다';
  END IF;

  -- 빈 문자열/공백은 사유 없음(NULL)으로 정규화
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

  -- ② 취소 이벤트 이력 append
  INSERT INTO public.gthr_attd_hist (gthr_id, mem_id, evt_cd, actor_kind, actor_mem_id, reason_txt)
  VALUES (p_gthr_id, p_mem_id, 'cancel', p_actor_kind, p_actor_mem_id, v_reason);
END;
$$;

COMMENT ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text)
  IS '참석 취소를 원자적으로 이력화: gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT. service_role 전용.';

REVOKE ALL ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_gthr_attendance(uuid, uuid, text, uuid, text) TO service_role;

-- ============================================================
-- REVERT (수동 롤백용 — 이 마이그레이션을 되돌리려면 아래를 실행)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.cancel_gthr_attendance(uuid, uuid, text, uuid, text);
-- DROP TABLE IF EXISTS public.gthr_attd_hist;
-- ============================================================
