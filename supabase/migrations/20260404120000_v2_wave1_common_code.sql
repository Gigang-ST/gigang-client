-- v2 웨이브 1: 공통코드 (cmm_cd_grp_mst, cmm_cd_mst) + 시드
-- 기준: .claude/docs/database-schema-v2.md §10, database-schema-v2-migration-map.md §2.1
-- 대상: supabase-gigang-dev

-- v2 공통 컬럼 upd_at 자동 갱신 (기존 set_updated_at은 updated_at 전용)
CREATE OR REPLACE FUNCTION public.set_v2_upd_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.upd_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_v2_upd_at() OWNER TO postgres;

CREATE TABLE public.cmm_cd_grp_mst (
  cd_grp_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cd_grp_cd text NOT NULL,
  cd_grp_nm text NOT NULL,
  use_yn boolean NOT NULL DEFAULT true,
  sort_ord integer NOT NULL DEFAULT 0,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_cmm_cd_grp_mst PRIMARY KEY (cd_grp_id),
  CONSTRAINT uk_cmm_cd_grp_mst_cd_vers UNIQUE (cd_grp_cd, vers)
);

CREATE TABLE public.cmm_cd_mst (
  cd_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cd_grp_id uuid NOT NULL REFERENCES public.cmm_cd_grp_mst (cd_grp_id) ON DELETE RESTRICT,
  cd text NOT NULL,
  cd_nm text NOT NULL,
  cd_desc text,
  use_yn boolean NOT NULL DEFAULT true,
  sort_ord integer NOT NULL DEFAULT 0,
  is_default_yn boolean NOT NULL DEFAULT false,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_cmm_cd_mst PRIMARY KEY (cd_id),
  CONSTRAINT uk_cmm_cd_mst_grp_cd_vers UNIQUE (cd_grp_id, cd, vers)
);

CREATE INDEX ix_cmm_cd_mst_cd_grp_id ON public.cmm_cd_mst (cd_grp_id);

CREATE TRIGGER cmm_cd_grp_mst_set_upd_at
  BEFORE UPDATE ON public.cmm_cd_grp_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

CREATE TRIGGER cmm_cd_mst_set_upd_at
  BEFORE UPDATE ON public.cmm_cd_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.cmm_cd_grp_mst IS '공통코드 그룹 마스터 (v2)';
COMMENT ON TABLE public.cmm_cd_mst IS '공통코드 마스터 (v2)';

-- 시드: 코드그룹 (cd_grp_cd = migration-map 2.1)
INSERT INTO public.cmm_cd_grp_mst (cd_grp_cd, cd_grp_nm, sort_ord, vers, del_yn)
VALUES
  ('MEM_ST_CD', '팀 소속 회원 상태', 10, 0, false),
  ('TEAM_ROLE_CD', '팀 내 역할', 20, 0, false),
  ('COMP_SPRT_CD', '대회 스포츠/형태', 30, 0, false),
  ('COMP_EVT_CD', '대회 종목/코스', 40, 0, false),
  ('PRT_ROLE_CD', '대회 참가 역할', 50, 0, false),
  ('REC_SRC_CD', '기록 출처', 60, 0, false),
  ('FEE_UPD_ST_CD', '회비 엑셀 업로드 상태', 70, 0, false),
  ('FEE_TXN_MATCH_ST_CD', '회비 거래 매칭 상태', 80, 0, false),
  ('FEE_ITEM_CD', '회비 거래 분류', 90, 0, false),
  ('FEE_PAY_ST_CD', '회비 납부 원장 상태', 100, 0, false);

-- 시드: 코드값 (cd = 소문자·스네이크 계열, migration-map 예시와 정렬)
INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, v.is_default_yn, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    -- MEM_ST_CD
    ('MEM_ST_CD', 'active', '활동', NULL::text, 1, true),
    ('MEM_ST_CD', 'inactive', '비활동', NULL, 2, false),
    ('MEM_ST_CD', 'pending', '승인 대기', NULL, 3, false),
    ('MEM_ST_CD', 'left', '탈퇴', NULL, 4, false),
    ('MEM_ST_CD', 'banned', '제재', NULL, 5, false),
    -- TEAM_ROLE_CD
    ('TEAM_ROLE_CD', 'owner', '오너', NULL, 1, false),
    ('TEAM_ROLE_CD', 'admin', '관리자', NULL, 2, false),
    ('TEAM_ROLE_CD', 'member', '멤버', NULL, 3, true),
    -- COMP_SPRT_CD
    ('COMP_SPRT_CD', 'road_run', '로드 런', NULL, 1, true),
    ('COMP_SPRT_CD', 'trail_run', '트레일 런', NULL, 2, false),
    ('COMP_SPRT_CD', 'triathlon', '트라이애슬론', NULL, 3, false),
    ('COMP_SPRT_CD', 'cycling', '사이클링', NULL, 4, false),
    -- COMP_EVT_CD
    ('COMP_EVT_CD', '5k', '5K', NULL, 1, false),
    ('COMP_EVT_CD', '10k', '10K', NULL, 2, false),
    ('COMP_EVT_CD', 'half', '하프', NULL, 3, false),
    ('COMP_EVT_CD', 'full', '풀', NULL, 4, false),
    ('COMP_EVT_CD', '50k', '50K', NULL, 5, false),
    ('COMP_EVT_CD', '100k', '100K', NULL, 6, false),
    ('COMP_EVT_CD', '100m', '100마일', NULL, 7, false),
    -- PRT_ROLE_CD
    ('PRT_ROLE_CD', 'participant', '참가자', NULL, 1, true),
    ('PRT_ROLE_CD', 'cheering', '응원', NULL, 2, false),
    ('PRT_ROLE_CD', 'volunteer', '봉사', NULL, 3, false),
    -- REC_SRC_CD
    ('REC_SRC_CD', 'manual', '수동', NULL, 1, true),
    ('REC_SRC_CD', 'imported', '가져오기', NULL, 2, false),
    ('REC_SRC_CD', 'api', 'API', NULL, 3, false),
    -- FEE_UPD_ST_CD
    ('FEE_UPD_ST_CD', 'pending', '대기', NULL, 1, true),
    ('FEE_UPD_ST_CD', 'confirmed', '확정', NULL, 2, false),
    ('FEE_UPD_ST_CD', 'rolled_back', '롤백', NULL, 3, false),
    -- FEE_TXN_MATCH_ST_CD
    ('FEE_TXN_MATCH_ST_CD', 'matched', '매칭됨', NULL, 1, false),
    ('FEE_TXN_MATCH_ST_CD', 'unmatched', '미매칭', NULL, 2, true),
    ('FEE_TXN_MATCH_ST_CD', 'ambiguous', '동명이인', NULL, 3, false),
    -- FEE_ITEM_CD
    ('FEE_ITEM_CD', 'due', '회비', NULL, 1, true),
    ('FEE_ITEM_CD', 'expense', '지출', NULL, 2, false),
    ('FEE_ITEM_CD', 'event_fee', '행사비', NULL, 3, false),
    ('FEE_ITEM_CD', 'goods', '물품', NULL, 4, false),
    ('FEE_ITEM_CD', 'other', '기타', NULL, 5, false),
    -- FEE_PAY_ST_CD
    ('FEE_PAY_ST_CD', 'paid', '납부', NULL, 1, true),
    ('FEE_PAY_ST_CD', 'cancelled', '취소', NULL, 2, false),
    ('FEE_PAY_ST_CD', 'refunded', '환불', NULL, 3, false)
) AS v(grp_cd, cd, cd_nm, cd_desc, sort_ord, is_default_yn)
WHERE g.cd_grp_cd = v.grp_cd AND g.vers = 0 AND g.del_yn = false;

ALTER TABLE public.cmm_cd_grp_mst ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmm_cd_mst ENABLE ROW LEVEL SECURITY;

-- 참조 데이터: 로그인 사용자·익명 클라이언트 읽기 (소프트삭제 제외)
CREATE POLICY cmm_cd_grp_mst_select_authenticated
  ON public.cmm_cd_grp_mst
  FOR SELECT
  TO authenticated
  USING (del_yn = false);

CREATE POLICY cmm_cd_grp_mst_select_anon
  ON public.cmm_cd_grp_mst
  FOR SELECT
  TO anon
  USING (del_yn = false);

CREATE POLICY cmm_cd_mst_select_authenticated
  ON public.cmm_cd_mst
  FOR SELECT
  TO authenticated
  USING (del_yn = false);

CREATE POLICY cmm_cd_mst_select_anon
  ON public.cmm_cd_mst
  FOR SELECT
  TO anon
  USING (del_yn = false);

GRANT ALL ON TABLE public.cmm_cd_grp_mst TO anon;
GRANT ALL ON TABLE public.cmm_cd_grp_mst TO authenticated;
GRANT ALL ON TABLE public.cmm_cd_grp_mst TO service_role;

GRANT ALL ON TABLE public.cmm_cd_mst TO anon;
GRANT ALL ON TABLE public.cmm_cd_mst TO authenticated;
GRANT ALL ON TABLE public.cmm_cd_mst TO service_role;
