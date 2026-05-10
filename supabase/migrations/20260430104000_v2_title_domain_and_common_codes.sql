-- v2 칭호 도메인: ttl_mst, mem_ttl_rel + 공통코드(TTL_CTGR_CD, TTL_PT_CHG_RSN_CD)
-- 기준: .claude/docs/database-schema-v2-title-domain.md

-- 0) enum 정의
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'ttl_kind_enm'
  ) THEN
    CREATE TYPE public.ttl_kind_enm AS ENUM ('auto', 'awarded');
  END IF;
END $$;

-- 1) 칭호 마스터
CREATE TABLE IF NOT EXISTS public.ttl_mst (
  ttl_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  ttl_kind_enm public.ttl_kind_enm NOT NULL,
  ttl_ctgr_cd text NOT NULL,
  ttl_nm text NOT NULL,
  ttl_desc text,
  ttl_rank integer NOT NULL DEFAULT 0,
  cond_rule_json jsonb,
  base_pt integer NOT NULL DEFAULT 0,
  sort_ord integer NOT NULL DEFAULT 100,
  use_yn boolean NOT NULL DEFAULT true,
  crt_by uuid,
  upd_by uuid,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_ttl_mst PRIMARY KEY (ttl_id),
  CONSTRAINT fk_ttl_mst__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ttl_mst__crt_by FOREIGN KEY (crt_by) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT fk_ttl_mst__upd_by FOREIGN KEY (upd_by) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT uk_ttl_mst_team_ttl_nm_vers UNIQUE (team_id, ttl_nm, vers),
  CONSTRAINT uk_ttl_mst_team_ttl_id UNIQUE (team_id, ttl_id),
  CONSTRAINT ck_ttl_mst_ttl_rank_non_negative CHECK (ttl_rank >= 0),
  CONSTRAINT ck_ttl_mst_base_pt_non_negative CHECK (base_pt >= 0)
);

CREATE INDEX IF NOT EXISTS ix_ttl_mst_team_use
  ON public.ttl_mst (team_id, use_yn, del_yn);
CREATE INDEX IF NOT EXISTS ix_ttl_mst_team_kind_ctgr
  ON public.ttl_mst (team_id, ttl_kind_enm, ttl_ctgr_cd);

DROP TRIGGER IF EXISTS ttl_mst_set_upd_at ON public.ttl_mst;
CREATE TRIGGER ttl_mst_set_upd_at
  BEFORE UPDATE ON public.ttl_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.ttl_mst IS '팀별 칭호 카탈로그 마스터 (v2)';

-- 2) 회원-칭호 관계
CREATE TABLE IF NOT EXISTS public.mem_ttl_rel (
  mem_ttl_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  team_mem_id uuid NOT NULL,
  ttl_id uuid NOT NULL,
  grnt_at timestamptz NOT NULL DEFAULT now(),
  exp_at timestamptz,
  grnt_by_mem_id uuid,
  grnt_pt integer NOT NULL DEFAULT 0,
  aply_pt integer NOT NULL DEFAULT 0,
  pt_calc_at timestamptz,
  pt_calc_bsis_json jsonb,
  pt_chg_rsn_cd text,
  grnt_rsn_txt text,
  is_prmy_yn boolean NOT NULL DEFAULT false,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_ttl_rel PRIMARY KEY (mem_ttl_id),
  CONSTRAINT fk_mem_ttl_rel__grnt_by FOREIGN KEY (grnt_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT fk_mem_ttl_rel__team_mem_rel FOREIGN KEY (team_mem_id) REFERENCES public.team_mem_rel (team_mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mem_ttl_rel__ttl_mst FOREIGN KEY (team_id, ttl_id) REFERENCES public.ttl_mst (team_id, ttl_id) ON DELETE RESTRICT,
  CONSTRAINT uk_mem_ttl_rel_team_mem_ttl_vers UNIQUE (team_mem_id, ttl_id, vers),
  CONSTRAINT ck_mem_ttl_rel_grnt_pt_non_negative CHECK (grnt_pt >= 0),
  CONSTRAINT ck_mem_ttl_rel_aply_pt_non_negative CHECK (aply_pt >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_mem_ttl_rel_team_mem_primary_current
  ON public.mem_ttl_rel (team_mem_id)
  WHERE is_prmy_yn = true AND vers = 0 AND del_yn = false;

CREATE INDEX IF NOT EXISTS ix_mem_ttl_rel_team_mem
  ON public.mem_ttl_rel (team_mem_id, vers, del_yn);
CREATE INDEX IF NOT EXISTS ix_mem_ttl_rel_team_ttl
  ON public.mem_ttl_rel (team_id, ttl_id, vers, del_yn);
CREATE INDEX IF NOT EXISTS ix_mem_ttl_rel_exp
  ON public.mem_ttl_rel (team_id, exp_at)
  WHERE exp_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mem_ttl_rel_pt_calc_at
  ON public.mem_ttl_rel (team_id, pt_calc_at);

DROP TRIGGER IF EXISTS mem_ttl_rel_set_upd_at ON public.mem_ttl_rel;
CREATE TRIGGER mem_ttl_rel_set_upd_at
  BEFORE UPDATE ON public.mem_ttl_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.mem_ttl_rel IS '회원 보유 칭호 관계/이력 (v2)';

-- 3) 공통코드 그룹 추가
INSERT INTO public.cmm_cd_grp_mst (cd_grp_cd, cd_grp_nm, sort_ord, vers, del_yn)
SELECT v.cd_grp_cd, v.cd_grp_nm, v.sort_ord, 0, false
FROM (
  VALUES
    ('TTL_CTGR_CD', '칭호 카테고리', 110),
    ('TTL_PT_CHG_RSN_CD', '칭호 점수/상태 변경 사유', 120)
) AS v(cd_grp_cd, cd_grp_nm, sort_ord)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cmm_cd_grp_mst g
  WHERE g.cd_grp_cd = v.cd_grp_cd
    AND g.vers = 0
    AND g.del_yn = false
);

-- 4) 공통코드 값 추가
INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, v.is_default_yn, 0, false
FROM public.cmm_cd_grp_mst g
JOIN (
  VALUES
    -- TTL_CTGR_CD
    ('TTL_CTGR_CD', 'running', '러닝', '러닝 관련 자동 칭호 카테고리', 1, false),
    ('TTL_CTGR_CD', 'triathlon', '철인', '트라이애슬론 관련 자동 칭호 카테고리', 2, false),
    ('TTL_CTGR_CD', 'trail', '트레일', '트레일 러닝 관련 자동 칭호 카테고리', 3, false),
    ('TTL_CTGR_CD', 'cycling', '자전거', '자전거 관련 자동 칭호 카테고리', 4, false),
    ('TTL_CTGR_CD', 'awarded', '수여', '관리자 수여 칭호 카테고리', 5, true),
    -- TTL_PT_CHG_RSN_CD (배치 제외 5종)
    ('TTL_PT_CHG_RSN_CD', 'initial_grant', '최초 부여', '칭호 최초 획득 시점', 1, true),
    ('TTL_PT_CHG_RSN_CD', 'manual_adjust', '관리자 조정', '관리자가 점수/상태를 수동 조정', 2, false),
    ('TTL_PT_CHG_RSN_CD', 'expire', '만료', '만료 시각 도달로 효력 종료', 3, false),
    ('TTL_PT_CHG_RSN_CD', 'revoke', '회수', '운영 정책에 따른 칭호 회수/박탈', 4, false),
    ('TTL_PT_CHG_RSN_CD', 'policy_change', '정책 변경', '운영 정책 변경에 따른 일괄 반영', 5, false)
) AS v(grp_cd, cd, cd_nm, cd_desc, sort_ord, is_default_yn)
  ON g.cd_grp_cd = v.grp_cd
  AND g.vers = 0
  AND g.del_yn = false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cmm_cd_mst c
  WHERE c.cd_grp_id = g.cd_grp_id
    AND c.cd = v.cd
    AND c.vers = 0
    AND c.del_yn = false
);
