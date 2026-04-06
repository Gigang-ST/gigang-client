-- v2 웨이브 3: 대회·참가 (comp_mst, comp_evt_cfg, team_comp_plan_rel, comp_reg_rel)
-- 기준: .claude/docs/database-schema-v2-domains.md §2, database-schema-v2-migration-map.md §3.2–3.3
-- 선행: 20260404081732_v2_wave2_member_team.sql
-- 대상: supabase-gigang-dev
-- 버전: supabase_migrations.schema_migrations 와 동일한 타임스탬프 (CLI·원격 동기화용)

-- 전역 대회 마스터
CREATE TABLE public.comp_mst (
  comp_id uuid NOT NULL DEFAULT gen_random_uuid(),
  comp_sprt_cd text,
  comp_nm text NOT NULL,
  stt_dt date NOT NULL,
  end_dt date,
  loc_nm text,
  src_url text,
  ext_id text,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_comp_mst PRIMARY KEY (comp_id),
  CONSTRAINT uk_comp_mst_ext_id UNIQUE (ext_id),
  CONSTRAINT ck_comp_mst_comp_sprt_cd CHECK (
    comp_sprt_cd IS NULL
    OR comp_sprt_cd IN ('road_run', 'trail_run', 'triathlon', 'cycling')
  )
);

CREATE INDEX ix_comp_mst_stt_dt ON public.comp_mst (stt_dt);

CREATE TRIGGER comp_mst_set_upd_at
  BEFORE UPDATE ON public.comp_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.comp_mst IS '전역 대회 마스터 (v2)';

-- 대회 종목 설정
CREATE TABLE public.comp_evt_cfg (
  comp_evt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  comp_id uuid NOT NULL,
  evt_cd text NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_comp_evt_cfg PRIMARY KEY (comp_evt_id),
  CONSTRAINT fk_comp_evt_cfg__comp_mst FOREIGN KEY (comp_id) REFERENCES public.comp_mst (comp_id) ON DELETE RESTRICT,
  CONSTRAINT uk_comp_evt_cfg_comp_evt_vers UNIQUE (comp_id, evt_cd, vers),
  CONSTRAINT ck_comp_evt_cfg_evt_cd CHECK (
    evt_cd IN ('5k', '10k', 'half', 'full', '50k', '100k', '100m')
  )
);

CREATE INDEX ix_comp_evt_cfg_comp_id ON public.comp_evt_cfg (comp_id);

CREATE TRIGGER comp_evt_cfg_set_upd_at
  BEFORE UPDATE ON public.comp_evt_cfg
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.comp_evt_cfg IS '대회 종목 설정 (v2)';

-- 팀별 대회 운영 컨텍스트
CREATE TABLE public.team_comp_plan_rel (
  team_comp_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  comp_id uuid NOT NULL,
  note_txt text,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_team_comp_plan_rel PRIMARY KEY (team_comp_id),
  CONSTRAINT fk_team_comp_plan_rel__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_team_comp_plan_rel__comp_mst FOREIGN KEY (comp_id) REFERENCES public.comp_mst (comp_id) ON DELETE RESTRICT,
  CONSTRAINT uk_team_comp_plan_rel_team_comp_vers UNIQUE (team_id, comp_id, vers)
);

CREATE INDEX ix_team_comp_plan_rel_team_id ON public.team_comp_plan_rel (team_id);
CREATE INDEX ix_team_comp_plan_rel_comp_id ON public.team_comp_plan_rel (comp_id);

CREATE TRIGGER team_comp_plan_rel_set_upd_at
  BEFORE UPDATE ON public.team_comp_plan_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.team_comp_plan_rel IS '팀별 대회 운영 컨텍스트 (v2)';

-- 대회 참가 관계
CREATE TABLE public.comp_reg_rel (
  comp_reg_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_comp_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  comp_evt_id uuid,
  prt_role_cd text NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_comp_reg_rel PRIMARY KEY (comp_reg_id),
  CONSTRAINT fk_comp_reg_rel__team_comp FOREIGN KEY (team_comp_id) REFERENCES public.team_comp_plan_rel (team_comp_id) ON DELETE RESTRICT,
  CONSTRAINT fk_comp_reg_rel__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_comp_reg_rel__comp_evt_cfg FOREIGN KEY (comp_evt_id) REFERENCES public.comp_evt_cfg (comp_evt_id) ON DELETE SET NULL,
  CONSTRAINT uk_comp_reg_rel_team_comp_mem_vers UNIQUE (team_comp_id, mem_id, vers),
  CONSTRAINT ck_comp_reg_rel_prt_role_cd CHECK (
    prt_role_cd IN ('participant', 'cheering', 'volunteer')
  )
);

CREATE INDEX ix_comp_reg_rel_team_comp_id ON public.comp_reg_rel (team_comp_id);
CREATE INDEX ix_comp_reg_rel_mem_id ON public.comp_reg_rel (mem_id);
CREATE INDEX ix_comp_reg_rel_comp_evt_id ON public.comp_reg_rel (comp_evt_id);

CREATE TRIGGER comp_reg_rel_set_upd_at
  BEFORE UPDATE ON public.comp_reg_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.comp_reg_rel IS '대회 참가 관계 (v2)';

-- RLS
ALTER TABLE public.comp_mst ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_evt_cfg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_comp_plan_rel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_reg_rel ENABLE ROW LEVEL SECURITY;

-- 레거시 competition 과 유사: 대회 목록은 공개 조회 (소프트삭제 제외)
CREATE POLICY comp_mst_select_public
  ON public.comp_mst
  FOR SELECT
  USING (del_yn = false);

CREATE POLICY comp_evt_cfg_select_public
  ON public.comp_evt_cfg
  FOR SELECT
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.comp_mst c
      WHERE c.comp_id = comp_evt_cfg.comp_id
        AND c.del_yn = false
    )
  );

-- 대회 마스터·종목 CUD: 레거시 member.admin (전환기). v2 단일화 후 정책 교체 예정
CREATE POLICY comp_mst_mutate_legacy_admin
  ON public.comp_mst
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.member m
      WHERE m.admin = true
        AND (m.kakao_user_id = auth.uid() OR m.google_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.member m
      WHERE m.admin = true
        AND (m.kakao_user_id = auth.uid() OR m.google_user_id = auth.uid())
    )
  );

CREATE POLICY comp_evt_cfg_mutate_legacy_admin
  ON public.comp_evt_cfg
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.member m
      WHERE m.admin = true
        AND (m.kakao_user_id = auth.uid() OR m.google_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.member m
      WHERE m.admin = true
        AND (m.kakao_user_id = auth.uid() OR m.google_user_id = auth.uid())
    )
  );

-- comp_mst / comp_evt_cfg: SELECT 정책이 FOR ALL 관리자 정책과 중복될 때 — 관리자는 ALL, 비관리자는 SELECT만
-- PostgreSQL: OR 로 정책 합산. FOR ALL 은 SELECT 포함하므로 관리자는 comp_mst_select_public 과 중복 허용.
-- 비관리자 authenticated 는 comp_mst_select_public 만 만족.

-- 팀–대회 플랜: 소속 팀원 조회, owner/admin만 CUD
CREATE POLICY team_comp_plan_rel_select_member
  ON public.team_comp_plan_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_comp_plan_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

CREATE POLICY team_comp_plan_rel_mutate_admin
  ON public.team_comp_plan_rel
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_comp_plan_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_comp_plan_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- 참가: 해당 팀 소속만 조회 (레거시 전면 공개보다 팀 격리)
CREATE POLICY comp_reg_rel_select_teammate
  ON public.comp_reg_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = auth.uid()
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

CREATE POLICY comp_reg_rel_insert_self_member
  ON public.comp_reg_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    mem_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = auth.uid()
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

CREATE POLICY comp_reg_rel_update_self_or_team_admin
  ON public.comp_reg_rel
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND (
      mem_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.team_comp_plan_rel tcp
        INNER JOIN public.team_mem_rel r
          ON r.team_id = tcp.team_id
        WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
          AND r.mem_id = auth.uid()
          AND r.team_role_cd IN ('owner', 'admin')
          AND tcp.vers = 0
          AND tcp.del_yn = false
          AND r.vers = 0
          AND r.del_yn = false
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
    OR mem_id = auth.uid()
  );

CREATE POLICY comp_reg_rel_delete_self_or_team_admin
  ON public.comp_reg_rel
  FOR DELETE
  TO authenticated
  USING (
    mem_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = auth.uid()
        AND r.team_role_cd IN ('owner', 'admin')
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

GRANT ALL ON TABLE public.comp_mst TO anon;
GRANT ALL ON TABLE public.comp_mst TO authenticated;
GRANT ALL ON TABLE public.comp_mst TO service_role;

GRANT ALL ON TABLE public.comp_evt_cfg TO anon;
GRANT ALL ON TABLE public.comp_evt_cfg TO authenticated;
GRANT ALL ON TABLE public.comp_evt_cfg TO service_role;

GRANT ALL ON TABLE public.team_comp_plan_rel TO anon;
GRANT ALL ON TABLE public.team_comp_plan_rel TO authenticated;
GRANT ALL ON TABLE public.team_comp_plan_rel TO service_role;

GRANT ALL ON TABLE public.comp_reg_rel TO anon;
GRANT ALL ON TABLE public.comp_reg_rel TO authenticated;
GRANT ALL ON TABLE public.comp_reg_rel TO service_role;
