-- mem_onbd_prf: 온보딩 프로필 확장 테이블(mem_mst 1:1 위성) + 공통코드 시드
-- 기준: docs/design/2026-07-08-뉴비온보딩-유령회원방지.md §6.1
-- 패턴 참고: 20260404165809_v2_mem_utmb_prf.sql(위성 테이블 + set_v2_upd_at 트리거)
--           20260407013000_comp_evt_type_and_sport_event_code_groups.sql(공통코드 시드)

CREATE TABLE public.mem_onbd_prf (
  mem_id           uuid NOT NULL,
  near_stn_nm      varchar,                 -- 가까운 역 (선택)
  avg_run_dist_km  numeric(4,1),            -- 평균 러닝 거리 km (선택)
  avg_pace_cd      varchar,                 -- P330~P730 / P730_OVER / UNKNOWN (선택)
  join_purp_cds    text[] NOT NULL DEFAULT '{}',  -- 가입 목적 칩 (온보딩은 앱 레벨에서 1개 이상 강제)
  join_purp_txt    text,                    -- 목적 자유입력 (선택)
  join_src_cd      varchar,                 -- 유입 경로 칩 (온보딩은 앱 레벨에서 필수, 기존 회원 upsert는 null 허용)
  join_src_txt     text,                    -- 유입 경로 기타 상세 (선택)
  attd_pldg_at     timestamptz,             -- 참석 약속 클릭 시각 (온보딩 경로에서만 기록)
  pldg_gthr_id     uuid,                    -- 약속 시 참가 신청한 모임
  crt_at           timestamptz NOT NULL DEFAULT now(),
  upd_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_onbd_prf PRIMARY KEY (mem_id),
  CONSTRAINT fk_mem_onbd_prf__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE CASCADE,
  CONSTRAINT fk_mem_onbd_prf__gthr_mst FOREIGN KEY (pldg_gthr_id) REFERENCES public.gthr_mst (gthr_id) ON DELETE SET NULL,
  CONSTRAINT ck_mem_onbd_prf_avg_run_dist_km CHECK (avg_run_dist_km IS NULL OR (avg_run_dist_km >= 0.5 AND avg_run_dist_km <= 100)),
  CONSTRAINT ck_mem_onbd_prf_avg_pace_cd CHECK (
    avg_pace_cd IS NULL OR avg_pace_cd IN (
      'P330','P400','P430','P500','P530','P600','P630','P700','P730','P730_OVER','UNKNOWN'
    )
  )
);

COMMENT ON TABLE public.mem_onbd_prf IS '회원 온보딩 프로필 확장 (mem_mst 1:1) — 러닝 프로필·가입 목적·유입 경로·참석 약속';
COMMENT ON COLUMN public.mem_onbd_prf.attd_pldg_at IS '온보딩 6단계 참석 약속 클릭 시각. 개편 후 신규가입자 식별 기준(IS NOT NULL)';
COMMENT ON COLUMN public.mem_onbd_prf.pldg_gthr_id IS '참석 약속 시 선택한 모임(없으면 null) — 삭제된 모임이면 SET NULL';

CREATE TRIGGER mem_onbd_prf_set_upd_at
  BEFORE UPDATE ON public.mem_onbd_prf
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

ALTER TABLE public.mem_onbd_prf ENABLE ROW LEVEL SECURITY;

-- 본인 SELECT/INSERT/UPDATE. v2 레거시 OAuth 연동 계정도 인식하도록 v2_rls_resolve_mem_id() 사용.
CREATE POLICY mem_onbd_prf_select_own
  ON public.mem_onbd_prf
  FOR SELECT
  TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

CREATE POLICY mem_onbd_prf_insert_own
  ON public.mem_onbd_prf
  FOR INSERT
  TO authenticated
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id());

CREATE POLICY mem_onbd_prf_update_own
  ON public.mem_onbd_prf
  FOR UPDATE
  TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id())
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id());

-- 관리자(팀 owner/admin) SELECT — team_mem_rel 기준 판별 함수 재사용(20260421130000 도입)
CREATE POLICY mem_onbd_prf_select_team_admin
  ON public.mem_onbd_prf
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = mem_onbd_prf.mem_id
        AND r.vers = 0
        AND r.del_yn = false
        AND public.v2_rls_auth_team_owner_or_admin(r.team_id)
    )
  );

GRANT ALL ON TABLE public.mem_onbd_prf TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mem_onbd_prf TO authenticated;

-- ============================================================
-- 공통코드 시드: JOIN_PURP(가입 목적, 7종) + JOIN_SRC(유입 경로, 5종)
-- 패턴: 20260407013000_comp_evt_type_and_sport_event_code_groups.sql
-- ============================================================

INSERT INTO public.cmm_cd_grp_mst (cd_grp_cd, cd_grp_nm, sort_ord, vers, del_yn)
VALUES
  ('JOIN_PURP', '가입 목적', 51, 0, false),
  ('JOIN_SRC', '유입 경로', 52, 0, false)
ON CONFLICT (cd_grp_cd, vers) DO NOTHING;

INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, v.is_default_yn, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    -- JOIN_PURP (설계 §3.1)
    ('JOIN_PURP', 'RUN_MATE', '같이 달릴 사람이 필요해요', '가입 목적: 러닝 메이트', 1, true),
    ('JOIN_PURP', 'COACH', '자세·훈련 코칭을 받고 싶어요', '가입 목적: 코칭', 2, false),
    ('JOIN_PURP', 'TRAINING', '인터벌 같은 훈련을 같이 하고 싶어요', '가입 목적: 훈련', 3, false),
    ('JOIN_PURP', 'NEW_SPORT', '안 해본 운동을 해보고 싶어요', '가입 목적: 신규 스포츠', 4, false),
    ('JOIN_PURP', 'RACE', '대회에 같이 나가고 싶어요', '가입 목적: 대회', 5, false),
    ('JOIN_PURP', 'FRIENDS', '새로운 친구를 만나고 싶어요', '가입 목적: 친목', 6, false),
    ('JOIN_PURP', 'HABIT', '운동 습관을 만들고 싶어요', '가입 목적: 습관 형성', 7, false),
    -- JOIN_SRC (설계 §3.5)
    ('JOIN_SRC', 'FRIEND', '지인 소개', '유입 경로: 지인 소개', 1, true),
    ('JOIN_SRC', 'INSTA', '인스타그램', '유입 경로: 인스타그램', 2, false),
    ('JOIN_SRC', 'SOMOIM', '소모임', '유입 경로: 소모임', 3, false),
    ('JOIN_SRC', 'DAANGN', '당근', '유입 경로: 당근마켓', 4, false),
    ('JOIN_SRC', 'ETC', '기타', '유입 경로: 기타(자유입력)', 5, false)
) AS v(grp_cd, cd, cd_nm, cd_desc, sort_ord, is_default_yn)
WHERE g.cd_grp_cd = v.grp_cd
  AND g.vers = 0
  AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;
