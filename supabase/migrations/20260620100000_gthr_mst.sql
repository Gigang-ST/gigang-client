-- ============================================================
-- gthr_mst — 모임 마스터
-- 팀 멤버 누구나 개설할 수 있는 러닝 모임 (일반/정기/이벤트)
-- 댓글: cmnt_mst entity_type='gathering' 공용 테이블 사용
-- ============================================================

CREATE TABLE public.gthr_mst (
  gthr_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES public.team_mst(team_id),
  gthr_type_enm text       NOT NULL CHECK (gthr_type_enm IN ('general', 'regular', 'event')),
  gthr_nm      text        NOT NULL,
  desc_txt     text,
  loc_txt      text,
  stt_at       timestamptz NOT NULL,
  end_at       timestamptz,
  max_prt_cnt  int,
  crt_by       uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  del_yn       boolean     NOT NULL DEFAULT false,
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.gthr_mst              IS '모임 마스터 (팀 멤버 누구나 개설)';
COMMENT ON COLUMN public.gthr_mst.gthr_id      IS 'PK';
COMMENT ON COLUMN public.gthr_mst.team_id      IS '소속 팀 (team_mst FK)';
COMMENT ON COLUMN public.gthr_mst.gthr_type_enm IS '모임 유형: general(일반) | regular(정기) | event(이벤트)';
COMMENT ON COLUMN public.gthr_mst.gthr_nm      IS '모임명 (필수)';
COMMENT ON COLUMN public.gthr_mst.desc_txt     IS '모임 설명 (선택)';
COMMENT ON COLUMN public.gthr_mst.loc_txt      IS '장소 (선택)';
COMMENT ON COLUMN public.gthr_mst.stt_at       IS '모임 시작 일시 (필수)';
COMMENT ON COLUMN public.gthr_mst.end_at       IS '모임 종료 일시 (선택)';
COMMENT ON COLUMN public.gthr_mst.max_prt_cnt  IS '최대 참석 인원 (null=제한없음)';
COMMENT ON COLUMN public.gthr_mst.crt_by       IS '개설자 mem_id (mem_mst FK)';
COMMENT ON COLUMN public.gthr_mst.del_yn       IS '삭제여부 (soft delete)';
COMMENT ON COLUMN public.gthr_mst.crt_at       IS '생성 일시';
COMMENT ON COLUMN public.gthr_mst.upd_at       IS '수정 일시';

-- 홈 탭 캘린더 조회용: 팀 + 날짜 기준 활성 모임 목록
CREATE INDEX ix_gthr_mst_team_stt_at
  ON public.gthr_mst(team_id, stt_at ASC)
  WHERE del_yn = false;

-- 개설자 기준 내 모임 조회
CREATE INDEX ix_gthr_mst_crt_by
  ON public.gthr_mst(crt_by)
  WHERE del_yn = false;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.gthr_mst ENABLE ROW LEVEL SECURITY;

-- SELECT: 팀 멤버 전체 조회 (del_yn=false만)
CREATE POLICY gthr_mst_select ON public.gthr_mst
  FOR SELECT TO authenticated
  USING (del_yn = false AND public.v2_rls_auth_in_team(team_id));

-- INSERT: 팀 멤버 누구나 개설 (본인 crt_by로만)
CREATE POLICY gthr_mst_insert ON public.gthr_mst
  FOR INSERT TO authenticated
  WITH CHECK (
    crt_by = public.v2_rls_resolve_mem_id()
    AND del_yn = false
    AND public.v2_rls_auth_in_team(team_id)
  );

-- UPDATE: 개설자 본인 또는 팀 owner/admin (수정 및 soft delete 포함)
CREATE POLICY gthr_mst_update ON public.gthr_mst
  FOR UPDATE TO authenticated
  USING (
    crt_by = public.v2_rls_resolve_mem_id()
    OR public.v2_rls_auth_team_owner_or_admin(team_id)
  )
  WITH CHECK (
    crt_by = public.v2_rls_resolve_mem_id()
    OR public.v2_rls_auth_team_owner_or_admin(team_id)
  );

COMMENT ON POLICY gthr_mst_select ON public.gthr_mst IS '팀 멤버만 조회 (삭제된 모임 제외)';
COMMENT ON POLICY gthr_mst_insert ON public.gthr_mst IS '팀 멤버 누구나 모임 개설 가능';
COMMENT ON POLICY gthr_mst_update ON public.gthr_mst IS '개설자 본인 또는 팀 owner/admin만 수정·soft delete 가능';
