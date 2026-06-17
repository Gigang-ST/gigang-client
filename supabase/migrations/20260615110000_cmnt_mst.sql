-- ============================================================
-- cmnt_mst — 범용 댓글 테이블
-- entity_type + entity_id 로 소식(sch_post) / 대회(comp) / 모임(gathering) 공용
-- ============================================================

CREATE TABLE public.cmnt_mst (
  cmnt_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES public.team_mst(team_id),
  entity_type  text        NOT NULL
               CHECK (entity_type IN ('sch_post', 'comp', 'gathering')),
  entity_id    uuid        NOT NULL,
  prnt_id      uuid        REFERENCES public.cmnt_mst(cmnt_id),  -- null=루트댓글, 있으면 1단계 답글
  mem_id       uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  cont_txt     text        NOT NULL,
  edit_yn      boolean     NOT NULL DEFAULT false,
  del_yn       boolean     NOT NULL DEFAULT false,
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.cmnt_mst              IS '범용 댓글 (소식·대회·모임 공용)';
COMMENT ON COLUMN public.cmnt_mst.entity_type  IS 'sch_post | comp | gathering';
COMMENT ON COLUMN public.cmnt_mst.entity_id    IS 'sch_post_id / comp_id / gthr_id';
COMMENT ON COLUMN public.cmnt_mst.prnt_id      IS '부모 댓글 ID — null=루트, 있으면 1단계 답글';
COMMENT ON COLUMN public.cmnt_mst.edit_yn      IS '수정됨 표시 — 클라이언트에서 (수정됨) 렌더링';
COMMENT ON COLUMN public.cmnt_mst.del_yn       IS 'soft delete — 답글 있으면 자리표시자로 표시';

-- 엔티티별 댓글 목록 조회 (삭제됨 포함 — 자리표시자 표시용)
CREATE INDEX ix_cmnt_mst_entity
  ON public.cmnt_mst(team_id, entity_type, entity_id, crt_at ASC);

-- 멤버별 댓글 조회
CREATE INDEX ix_cmnt_mst_mem
  ON public.cmnt_mst(mem_id)
  WHERE del_yn = false;

-- ============================================================
-- cmnt_mention_rel — 댓글 멘션 관계
-- 알림 발송 대상 추적용 (cont_txt의 @이름 파싱 결과를 구조화)
-- ============================================================

CREATE TABLE public.cmnt_mention_rel (
  cmnt_id  uuid NOT NULL REFERENCES public.cmnt_mst(cmnt_id),
  mem_id   uuid NOT NULL REFERENCES public.mem_mst(mem_id),
  PRIMARY KEY (cmnt_id, mem_id)
);

COMMENT ON TABLE public.cmnt_mention_rel IS '댓글 멘션 관계 — 알림 발송 대상';

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.cmnt_mst         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmnt_mention_rel  ENABLE ROW LEVEL SECURITY;

-- cmnt_mst SELECT: 팀 멤버 전체 조회 (del_yn=true도 포함 — 자리표시자 표시)
CREATE POLICY cmnt_mst_select ON public.cmnt_mst
  FOR SELECT TO authenticated
  USING (public.v2_rls_auth_in_team(team_id));

-- cmnt_mst INSERT: 팀 멤버가 본인 mem_id로만 작성
CREATE POLICY cmnt_mst_insert ON public.cmnt_mst
  FOR INSERT TO authenticated
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND public.v2_rls_auth_in_team(team_id)
    AND del_yn = false
    AND edit_yn = false
  );

-- cmnt_mst UPDATE: 본인 수정/삭제 OR 관리자 삭제
CREATE POLICY cmnt_mst_update ON public.cmnt_mst
  FOR UPDATE TO authenticated
  USING (
    mem_id = public.v2_rls_resolve_mem_id()
    OR public.v2_rls_auth_team_owner_or_admin(team_id)
  )
  WITH CHECK (public.v2_rls_auth_in_team(team_id));

-- cmnt_mention_rel SELECT: 팀 멤버
CREATE POLICY cmnt_mention_rel_select ON public.cmnt_mention_rel
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cmnt_mst c
      WHERE c.cmnt_id = cmnt_mention_rel.cmnt_id
        AND public.v2_rls_auth_in_team(c.team_id)
    )
  );

-- cmnt_mention_rel INSERT: 서버 액션(service role)에서만 처리
