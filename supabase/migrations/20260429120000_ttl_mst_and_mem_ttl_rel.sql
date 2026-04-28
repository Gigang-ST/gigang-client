-- 칭호 도메인: ttl_mst(칭호 마스터) + mem_ttl_rel(회원-칭호 관계)
-- 근거: .claude/docs/database-schema-v2-title-domain.md §2

-- 1) 생성

-- 1-1) ttl_mst (칭호 마스터)
CREATE TABLE public.ttl_mst (
  ttl_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  ttl_kind_enm public.ttl_kind_enm NOT NULL,
  ttl_ctgr_cd text NOT NULL,
  ttl_nm text NOT NULL,
  ttl_rank integer NOT NULL,
  emoji_txt text,
  cond_rule jsonb,
  base_pt integer,
  desc_txt text,
  use_yn boolean NOT NULL DEFAULT true,
  sort_ord integer NOT NULL DEFAULT 0,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_ttl_mst PRIMARY KEY (ttl_id),
  CONSTRAINT fk_ttl_mst__team_mst
    FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT ck_ttl_mst_auto_rank
    CHECK (ttl_kind_enm <> 'auto' OR ttl_rank >= 1),
  CONSTRAINT ck_ttl_mst_awarded_rank
    CHECK (ttl_kind_enm <> 'awarded' OR ttl_rank = 0),
  CONSTRAINT ck_ttl_mst_base_pt_kind
    CHECK (
      (ttl_kind_enm = 'auto' AND base_pt IS NULL)
      OR ttl_kind_enm = 'awarded'
    ),
  CONSTRAINT ck_ttl_mst_base_pt_nonneg
    CHECK (base_pt IS NULL OR base_pt >= 0)
);

COMMENT ON TABLE public.ttl_mst IS '칭호 마스터 (v2): 팀별 자동/수여 칭호 정의';
COMMENT ON COLUMN public.ttl_mst.cond_rule IS '자동 칭호 조건 jsonb (type=join_age|pb|finish|finish_any). 수여 칭호는 NULL';
COMMENT ON COLUMN public.ttl_mst.base_pt IS '수여 칭호 기본 포인트. 자동 칭호는 NULL(동적 계산)';

-- 1-2) mem_ttl_rel (회원-칭호 관계)
CREATE TABLE public.mem_ttl_rel (
  mem_ttl_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  ttl_id uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  granted_by_mem_id uuid,
  granted_pt integer,
  granted_rsn_txt text,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_ttl_rel PRIMARY KEY (mem_ttl_id),
  CONSTRAINT fk_mem_ttl_rel__team_mst
    FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mem_ttl_rel__mem_mst
    FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mem_ttl_rel__ttl_mst
    FOREIGN KEY (ttl_id) REFERENCES public.ttl_mst (ttl_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mem_ttl_rel__granted_by
    FOREIGN KEY (granted_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT ck_mem_ttl_rel_expires_after_granted
    CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT ck_mem_ttl_rel_granted_pt_nonneg
    CHECK (granted_pt IS NULL OR granted_pt >= 0)
);

COMMENT ON TABLE public.mem_ttl_rel IS '회원-칭호 관계 (v2): 자동/수여 칭호 모두 보존. 자동은 카테고리 내 최상위 1건만 정본 유지(이력은 vers>0)';
COMMENT ON COLUMN public.mem_ttl_rel.granted_pt IS '수여 시 입력 포인트. 자동 칭호는 NULL(조회 시 동적 계산)';
COMMENT ON COLUMN public.mem_ttl_rel.expires_at IS '만료 시각(수여 칭호용). 화면에서 expires_at IS NULL OR > now() 필터';

-- 2) 백필: 해당 없음 (신규 테이블)

-- 3) 인덱스/제약

-- 3-1) ttl_mst 유니크/인덱스
CREATE UNIQUE INDEX uk_ttl_mst_team_kind_ctgr_rank
  ON public.ttl_mst (team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_rank, vers);

CREATE UNIQUE INDEX uk_ttl_mst_team_nm
  ON public.ttl_mst (team_id, ttl_nm, vers);

CREATE INDEX ix_ttl_mst_team_use
  ON public.ttl_mst (team_id, use_yn);

-- 3-2) mem_ttl_rel 유니크/인덱스
CREATE UNIQUE INDEX uk_mem_ttl_rel_team_mem_ttl
  ON public.mem_ttl_rel (team_id, mem_id, ttl_id, vers);

CREATE INDEX ix_mem_ttl_rel_team_mem
  ON public.mem_ttl_rel (team_id, mem_id);

CREATE INDEX ix_mem_ttl_rel_team_ttl
  ON public.mem_ttl_rel (team_id, ttl_id);

-- 3-3) upd_at 자동 갱신 트리거
CREATE TRIGGER ttl_mst_set_upd_at
  BEFORE UPDATE ON public.ttl_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

CREATE TRIGGER mem_ttl_rel_set_upd_at
  BEFORE UPDATE ON public.mem_ttl_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

-- 4) RLS

ALTER TABLE public.ttl_mst ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mem_ttl_rel ENABLE ROW LEVEL SECURITY;

-- 4-1) ttl_mst: 같은 팀 멤버 SELECT, 팀 owner/admin만 INSERT/UPDATE
DROP POLICY IF EXISTS ttl_mst_select_team_member ON public.ttl_mst;
CREATE POLICY ttl_mst_select_team_member
  ON public.ttl_mst
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_in_team(team_id)
  );

DROP POLICY IF EXISTS ttl_mst_insert_admin ON public.ttl_mst;
CREATE POLICY ttl_mst_insert_admin
  ON public.ttl_mst
  FOR INSERT
  TO authenticated
  WITH CHECK (public.v2_rls_auth_team_owner_or_admin(team_id));

DROP POLICY IF EXISTS ttl_mst_update_admin ON public.ttl_mst;
CREATE POLICY ttl_mst_update_admin
  ON public.ttl_mst
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_team_owner_or_admin(team_id)
  )
  WITH CHECK (public.v2_rls_auth_team_owner_or_admin(team_id));

COMMENT ON POLICY ttl_mst_select_team_member ON public.ttl_mst IS
  '같은 팀 멤버는 칭호 카탈로그 조회 가능';
COMMENT ON POLICY ttl_mst_insert_admin ON public.ttl_mst IS
  '칭호 정의 추가는 팀 owner/admin 권한';
COMMENT ON POLICY ttl_mst_update_admin ON public.ttl_mst IS
  '칭호 정의 수정은 팀 owner/admin 권한';

-- 4-2) mem_ttl_rel: 같은 팀 멤버 SELECT, 팀 owner/admin만 INSERT/UPDATE (자동 칭호는 서비스 롤로 처리)
DROP POLICY IF EXISTS mem_ttl_rel_select_team_member ON public.mem_ttl_rel;
CREATE POLICY mem_ttl_rel_select_team_member
  ON public.mem_ttl_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_in_team(team_id)
  );

DROP POLICY IF EXISTS mem_ttl_rel_insert_admin ON public.mem_ttl_rel;
CREATE POLICY mem_ttl_rel_insert_admin
  ON public.mem_ttl_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (public.v2_rls_auth_team_owner_or_admin(team_id));

DROP POLICY IF EXISTS mem_ttl_rel_update_admin ON public.mem_ttl_rel;
CREATE POLICY mem_ttl_rel_update_admin
  ON public.mem_ttl_rel
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_team_owner_or_admin(team_id)
  )
  WITH CHECK (public.v2_rls_auth_team_owner_or_admin(team_id));

COMMENT ON POLICY mem_ttl_rel_select_team_member ON public.mem_ttl_rel IS
  '같은 팀 멤버는 회원-칭호 보유 관계 조회 가능';
COMMENT ON POLICY mem_ttl_rel_insert_admin ON public.mem_ttl_rel IS
  '수여 칭호 INSERT는 팀 owner/admin. 자동 칭호 부여/갱신은 서비스 롤(서버 액션)에서만 수행';
COMMENT ON POLICY mem_ttl_rel_update_admin ON public.mem_ttl_rel IS
  '칭호 보유 관계 UPDATE(만료/취소 등)는 팀 owner/admin. 자동 칭호 이력화는 서비스 롤';

-- 5) 롤백
-- DROP TABLE IF EXISTS public.mem_ttl_rel;
-- DROP TABLE IF EXISTS public.ttl_mst;
