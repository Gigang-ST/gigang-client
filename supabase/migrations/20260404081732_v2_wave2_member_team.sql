-- v2 웨이브 2: 회원·팀 (mem_mst, team_mst, team_mem_rel) + RLS 초안
-- 기준: .claude/docs/database-schema-v2-member-domain.md, database-schema-v2.md §3–5
-- 선행: 20260404064718_v2_wave1_common_code.sql (set_v2_upd_at, cmm_cd)
-- 대상: supabase-gigang-dev
-- 버전: supabase_migrations.schema_migrations 와 동일한 타임스탬프 (CLI·원격 동기화용)

-- team_mst: 팀 마스터 (mem_mst보다 선행 — team_mem_rel이 참조)
CREATE TABLE public.team_mst (
  team_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_cd text NOT NULL,
  team_nm text NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_team_mst PRIMARY KEY (team_id),
  CONSTRAINT uk_team_mst_team_cd_vers UNIQUE (team_cd, vers)
);

CREATE INDEX ix_team_mst_team_cd ON public.team_mst (team_cd);

CREATE TRIGGER team_mst_set_upd_at
  BEFORE UPDATE ON public.team_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.team_mst IS '팀 마스터 (v2)';

-- mem_mst: 회원 전역 마스터 (auth.users 1:1)
CREATE TABLE public.mem_mst (
  mem_id uuid NOT NULL,
  mem_nm text NOT NULL,
  gdr_enm public.gender,
  birth_dt date,
  phone_no text,
  email_addr text,
  bank_nm text,
  bank_acct_no text,
  avatar_url text,
  oauth_kakao_id uuid,
  oauth_google_id uuid,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_mst PRIMARY KEY (mem_id),
  CONSTRAINT fk_mem_mst__auth_users FOREIGN KEY (mem_id) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT uk_mem_mst_email_addr_vers UNIQUE (email_addr, vers),
  CONSTRAINT uk_mem_mst_oauth_kakao_id_vers UNIQUE (oauth_kakao_id, vers),
  CONSTRAINT uk_mem_mst_oauth_google_id_vers UNIQUE (oauth_google_id, vers)
);

CREATE INDEX ix_mem_mst_email_addr ON public.mem_mst (email_addr);

CREATE TRIGGER mem_mst_set_upd_at
  BEFORE UPDATE ON public.mem_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.mem_mst IS '회원 전역 마스터 (v2)';

-- team_mem_rel: 팀–회원 관계
CREATE TABLE public.team_mem_rel (
  team_mem_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  team_role_cd text NOT NULL,
  mem_st_cd text NOT NULL,
  join_dt date,
  leave_dt date,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_team_mem_rel PRIMARY KEY (team_mem_id),
  CONSTRAINT fk_team_mem_rel__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_team_mem_rel__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT uk_team_mem_rel_team_mem_vers UNIQUE (team_id, mem_id, vers),
  CONSTRAINT ck_team_mem_rel_team_role_cd CHECK (
    team_role_cd IN ('owner', 'admin', 'member')
  ),
  CONSTRAINT ck_team_mem_rel_mem_st_cd CHECK (
    mem_st_cd IN ('active', 'inactive', 'pending', 'left', 'banned')
  )
);

CREATE INDEX ix_team_mem_rel_team_id ON public.team_mem_rel (team_id);
CREATE INDEX ix_team_mem_rel_mem_id ON public.team_mem_rel (mem_id);

CREATE TRIGGER team_mem_rel_set_upd_at
  BEFORE UPDATE ON public.team_mem_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.team_mem_rel IS '팀–회원 관계 (v2)';

-- RLS (database-schema-v2-member-domain.md §5)
ALTER TABLE public.team_mst ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mem_mst ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_mem_rel ENABLE ROW LEVEL SECURITY;

-- mem_mst: 본인 조회·수정·신규 행(가입)
CREATE POLICY mem_mst_select_own
  ON public.mem_mst
  FOR SELECT
  TO authenticated
  USING (mem_id = auth.uid() AND del_yn = false);

CREATE POLICY mem_mst_insert_own
  ON public.mem_mst
  FOR INSERT
  TO authenticated
  WITH CHECK (mem_id = auth.uid());

CREATE POLICY mem_mst_update_own
  ON public.mem_mst
  FOR UPDATE
  TO authenticated
  USING (mem_id = auth.uid() AND del_yn = false)
  WITH CHECK (mem_id = auth.uid());

-- team_mst: 소속 팀원만 조회, owner/admin만 수정 (신규 팀은 service_role 등 서버 경로 권장)
CREATE POLICY team_mst_select_member
  ON public.team_mst
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mst.team_id
        AND r.mem_id = auth.uid()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

CREATE POLICY team_mst_update_admin
  ON public.team_mst
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mst.team_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  )
  WITH CHECK (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mst.team_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- team_mem_rel: 같은 팀 소속이면 조회
CREATE POLICY team_mem_rel_select_teammate
  ON public.team_mem_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mem_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- 팀 관리자가 멤버 추가
CREATE POLICY team_mem_rel_insert_admin
  ON public.team_mem_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mem_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- 관리자가 타 멤버 수정, 본인은 본인 행 수정(탈퇴/프로필 팀 맥락)
CREATE POLICY team_mem_rel_update_admin_or_self
  ON public.team_mem_rel
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND (
      mem_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.team_mem_rel r
        WHERE r.team_id = team_mem_rel.team_id
          AND r.mem_id = auth.uid()
          AND r.team_role_cd IN ('owner', 'admin')
          AND r.vers = 0
          AND r.del_yn = false
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mem_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
    OR mem_id = auth.uid()
  );

-- 물리 삭제 금지 정책에 맞춤: 클라이언트 DELETE 비허용(정책 없음)

GRANT ALL ON TABLE public.team_mst TO anon;
GRANT ALL ON TABLE public.team_mst TO authenticated;
GRANT ALL ON TABLE public.team_mst TO service_role;

GRANT ALL ON TABLE public.mem_mst TO anon;
GRANT ALL ON TABLE public.mem_mst TO authenticated;
GRANT ALL ON TABLE public.mem_mst TO service_role;

GRANT ALL ON TABLE public.team_mem_rel TO anon;
GRANT ALL ON TABLE public.team_mem_rel TO authenticated;
GRANT ALL ON TABLE public.team_mem_rel TO service_role;
