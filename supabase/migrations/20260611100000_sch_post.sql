-- ============================================================
-- sch_post — 일정 공유 테이블
-- 멤버들이 러닝 소식/이벤트/대회접수 등을 자유롭게 공유하는 가벼운 일정 게시물
-- 모든 팀 멤버 등록 가능 (관리자 전용 아님)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sch_post (
  sch_post_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES public.team_mst(team_id),
  sch_nm       text        NOT NULL,
  evt_stt_at   timestamptz NOT NULL,
  evt_end_at   timestamptz,
  url          text,
  cont_txt     text,
  crt_by       uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now(),
  del_yn       boolean     NOT NULL DEFAULT false,
  vers         integer     NOT NULL DEFAULT 0
);

COMMENT ON TABLE  public.sch_post               IS '일정 공유 게시물 (러닝 소식/이벤트/대회접수 등)';
COMMENT ON COLUMN public.sch_post.sch_post_id   IS 'PK';
COMMENT ON COLUMN public.sch_post.team_id       IS '소속 팀 (team_mst FK)';
COMMENT ON COLUMN public.sch_post.sch_nm        IS '일정명 (필수)';
COMMENT ON COLUMN public.sch_post.evt_stt_at    IS '일정 시작 일시 (필수)';
COMMENT ON COLUMN public.sch_post.evt_end_at    IS '일정 종료 일시 (선택)';
COMMENT ON COLUMN public.sch_post.url           IS '관련 링크 (선택)';
COMMENT ON COLUMN public.sch_post.cont_txt      IS '본문 내용 (선택)';
COMMENT ON COLUMN public.sch_post.crt_by        IS '작성자 mem_id (mem_mst FK)';
COMMENT ON COLUMN public.sch_post.crt_at        IS '생성 일시';
COMMENT ON COLUMN public.sch_post.upd_at        IS '수정 일시';
COMMENT ON COLUMN public.sch_post.del_yn        IS '삭제여부';
COMMENT ON COLUMN public.sch_post.vers          IS '버전';

CREATE INDEX IF NOT EXISTS ix_sch_post_team_evt_stt_at
  ON public.sch_post(team_id, evt_stt_at ASC)
  WHERE del_yn = false;

CREATE INDEX IF NOT EXISTS ix_sch_post_crt_by
  ON public.sch_post(crt_by)
  WHERE del_yn = false;

ALTER TABLE public.sch_post ENABLE ROW LEVEL SECURITY;

CREATE POLICY sch_post_select ON public.sch_post
  FOR SELECT TO authenticated
  USING (del_yn = false AND public.v2_rls_auth_in_team(team_id));

CREATE POLICY sch_post_insert ON public.sch_post
  FOR INSERT TO authenticated
  WITH CHECK (
    crt_by = public.v2_rls_resolve_mem_id()
    AND vers = 0
    AND del_yn = false
    AND public.v2_rls_auth_in_team(team_id)
  );

CREATE POLICY sch_post_update ON public.sch_post
  FOR UPDATE TO authenticated
  USING (
    crt_by = public.v2_rls_resolve_mem_id()
    OR public.v2_rls_auth_team_owner_or_admin(team_id)
  )
  WITH CHECK (
    crt_by = public.v2_rls_resolve_mem_id()
    OR public.v2_rls_auth_team_owner_or_admin(team_id)
  );

COMMENT ON POLICY sch_post_select ON public.sch_post IS '팀 멤버만 조회';
COMMENT ON POLICY sch_post_insert ON public.sch_post IS '팀 멤버 누구나 등록 가능';
COMMENT ON POLICY sch_post_update ON public.sch_post IS '작성자 본인 또는 팀 owner/admin만 수정·soft delete 가능';
