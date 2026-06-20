-- ============================================================
-- gthr_attd_rel — 모임 참석 관계
-- 팀 멤버가 모임에 참석 등록/취소하는 M:N 관계 테이블
-- ============================================================

CREATE TABLE public.gthr_attd_rel (
  attd_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gthr_id  uuid        NOT NULL REFERENCES public.gthr_mst(gthr_id),
  mem_id   uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  crt_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gthr_id, mem_id)
);

COMMENT ON TABLE  public.gthr_attd_rel         IS '모임 참석 관계 (참석 등록/취소)';
COMMENT ON COLUMN public.gthr_attd_rel.attd_id IS 'PK';
COMMENT ON COLUMN public.gthr_attd_rel.gthr_id IS '모임 ID (gthr_mst FK)';
COMMENT ON COLUMN public.gthr_attd_rel.mem_id  IS '참석자 mem_id (mem_mst FK)';
COMMENT ON COLUMN public.gthr_attd_rel.crt_at  IS '참석 등록 일시';

-- 참석자 목록 조회용
CREATE INDEX ix_gthr_attd_rel_gthr
  ON public.gthr_attd_rel(gthr_id);

-- 내 참석 목록 조회용
CREATE INDEX ix_gthr_attd_rel_mem
  ON public.gthr_attd_rel(mem_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.gthr_attd_rel ENABLE ROW LEVEL SECURITY;

-- SELECT: 팀 멤버 (gthr_mst 통해 team_id 확인)
CREATE POLICY gthr_attd_rel_select ON public.gthr_attd_rel
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gthr_mst g
      WHERE g.gthr_id = gthr_attd_rel.gthr_id
        AND g.del_yn = false
        AND public.v2_rls_auth_in_team(g.team_id)
    )
  );

-- INSERT: 본인만 참석 등록 (같은 팀 모임에만)
CREATE POLICY gthr_attd_rel_insert ON public.gthr_attd_rel
  FOR INSERT TO authenticated
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND EXISTS (
      SELECT 1 FROM public.gthr_mst g
      WHERE g.gthr_id = gthr_attd_rel.gthr_id
        AND g.del_yn = false
        AND public.v2_rls_auth_in_team(g.team_id)
    )
  );

-- DELETE: 본인 참석 취소
CREATE POLICY gthr_attd_rel_delete ON public.gthr_attd_rel
  FOR DELETE TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

COMMENT ON POLICY gthr_attd_rel_select ON public.gthr_attd_rel IS '팀 멤버만 참석 목록 조회';
COMMENT ON POLICY gthr_attd_rel_insert ON public.gthr_attd_rel IS '본인만 같은 팀 모임에 참석 등록';
COMMENT ON POLICY gthr_attd_rel_delete ON public.gthr_attd_rel IS '본인만 참석 취소';
