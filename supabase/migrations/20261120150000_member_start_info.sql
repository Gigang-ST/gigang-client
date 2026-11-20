-- 신입 회원 시작 정보(이슈 #719) — 러닝 경력·주간 거리·기록(자기신고 기준선) + 가입 목적·유입 경로 칩 추가.
--
-- 1) mem_onbd_prf(사람 것)에 러닝 경력·주간 거리·"아직 완주 못 해봄"과 입력 출처·시각을 더한다.
-- 2) 자기신고 기록 테이블 mem_start_rec_rel — **대회 기록(rec_race_hist)과 섞이지 않는다.**
--    랭킹·칭호·포인트 어디에도 안 읽히는 "시작점 기준선"이고, 행마다 출처(SIGNUP/PROFILE)와 입력 시각을 가진다.
-- 3) 공통코드 JOIN_PURP·JOIN_SRC 에 칩을 **덧붙인다**. 기존 코드·정렬 순서는 그대로
--    (JOIN_SRC 의 '기타'만 맨 끝에 남도록 sort_ord 5 → 7).
-- 적용 순서: 이 마이그레이션 → 앱 배포 (앱이 새 칸을 읽고 쓴다. 옛 앱은 새 칸을 모르고 그대로 동작).
SET lock_timeout = '3s';

-- ────────────────────────────────────────────────────────────────
-- 1) mem_onbd_prf — 사람 단위 시작 정보
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.mem_onbd_prf
  ADD COLUMN IF NOT EXISTS run_career_cd      varchar,       -- 러닝 경력: NEW / UNDER_1Y / Y1_3 / OVER_3Y
  ADD COLUMN IF NOT EXISTS wkly_dist_cd       varchar,       -- 평소 주간 거리: ZERO / UNDER_10 / KM10_30 / KM30_50 / OVER_50
  ADD COLUMN IF NOT EXISTS start_rec_none_yn  boolean NOT NULL DEFAULT false, -- "아직 완주 못 해봄"
  ADD COLUMN IF NOT EXISTS start_info_src_cd  varchar,       -- 시작 정보를 처음 받은 곳: SIGNUP / PROFILE
  ADD COLUMN IF NOT EXISTS start_info_at      timestamptz,   -- 처음 입력한 시각
  ADD COLUMN IF NOT EXISTS start_info_upd_at  timestamptz;   -- 마지막으로 고친 시각

ALTER TABLE public.mem_onbd_prf
  DROP CONSTRAINT IF EXISTS ck_mem_onbd_prf_run_career_cd,
  DROP CONSTRAINT IF EXISTS ck_mem_onbd_prf_wkly_dist_cd,
  DROP CONSTRAINT IF EXISTS ck_mem_onbd_prf_start_info_src_cd;
ALTER TABLE public.mem_onbd_prf
  ADD CONSTRAINT ck_mem_onbd_prf_run_career_cd
    CHECK (run_career_cd IS NULL OR run_career_cd IN ('NEW', 'UNDER_1Y', 'Y1_3', 'OVER_3Y')),
  ADD CONSTRAINT ck_mem_onbd_prf_wkly_dist_cd
    CHECK (wkly_dist_cd IS NULL OR wkly_dist_cd IN ('ZERO', 'UNDER_10', 'KM10_30', 'KM30_50', 'OVER_50')),
  ADD CONSTRAINT ck_mem_onbd_prf_start_info_src_cd
    CHECK (start_info_src_cd IS NULL OR start_info_src_cd IN ('SIGNUP', 'PROFILE'));

COMMENT ON COLUMN public.mem_onbd_prf.run_career_cd IS '러닝 경력(자기신고, 선택) — 시작 정보';
COMMENT ON COLUMN public.mem_onbd_prf.wkly_dist_cd IS '평소 주간 거리 구간(자기신고, 선택) — 시작 정보';
COMMENT ON COLUMN public.mem_onbd_prf.start_rec_none_yn IS '"아직 완주 못 해봄" — true 면 mem_start_rec_rel 행이 없어야 한다(앱이 지킨다)';
COMMENT ON COLUMN public.mem_onbd_prf.start_info_src_cd IS '시작 정보를 처음 받은 곳(SIGNUP 가입 폼 / PROFILE 나중에 프로필에서)';
COMMENT ON COLUMN public.mem_onbd_prf.start_info_at IS '시작 정보를 처음 입력한 시각 — 가입 시점 정보와 나중에 채운 정보를 가르는 기준';
COMMENT ON COLUMN public.mem_onbd_prf.start_info_upd_at IS '시작 정보를 마지막으로 고친 시각';

-- ────────────────────────────────────────────────────────────────
-- 2) 자기신고 기록 — 대회 기록(rec_race_hist)과 별개
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mem_start_rec_rel (
  mem_id     uuid        NOT NULL REFERENCES public.mem_mst(mem_id) ON DELETE CASCADE,
  dist_cd    varchar     NOT NULL,   -- 5K / 10K / HALF / FULL
  rec_sec    integer     NOT NULL,   -- 기록(초)
  src_cd     varchar     NOT NULL DEFAULT 'SIGNUP',  -- SIGNUP / PROFILE
  crt_at     timestamptz NOT NULL DEFAULT now(),     -- 이 거리 기록을 처음 입력한 시각
  upd_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_start_rec_rel PRIMARY KEY (mem_id, dist_cd),
  CONSTRAINT ck_mem_start_rec_rel_dist_cd CHECK (dist_cd IN ('5K', '10K', 'HALF', 'FULL')),
  CONSTRAINT ck_mem_start_rec_rel_src_cd CHECK (src_cd IN ('SIGNUP', 'PROFILE')),
  CONSTRAINT ck_mem_start_rec_rel_rec_sec CHECK (rec_sec BETWEEN 600 AND 86400)
);

COMMENT ON TABLE public.mem_start_rec_rel IS
  '자기신고 시작 기록(기준선) — 가입 폼·프로필에서 본인이 적은 값. 대회 기록(rec_race_hist)이 아니라서 랭킹·칭호·포인트에 쓰지 않는다.';

CREATE TRIGGER mem_start_rec_rel_set_upd_at
  BEFORE UPDATE ON public.mem_start_rec_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

ALTER TABLE public.mem_start_rec_rel ENABLE ROW LEVEL SECURITY;

-- 쓰기는 서버(service_role)만 — 가입·프로필 저장 액션이 한다. 읽기는 본인 + 소속 팀 관리자(mem_onbd_prf 와 같은 경계).
DROP POLICY IF EXISTS mem_start_rec_rel_select_own ON public.mem_start_rec_rel;
CREATE POLICY mem_start_rec_rel_select_own ON public.mem_start_rec_rel
  FOR SELECT TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

DROP POLICY IF EXISTS mem_start_rec_rel_select_team_admin ON public.mem_start_rec_rel;
CREATE POLICY mem_start_rec_rel_select_team_admin ON public.mem_start_rec_rel
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = mem_start_rec_rel.mem_id
        AND r.vers = 0
        AND r.del_yn = false
        AND public.v2_rls_auth_team_owner_or_admin(r.team_id)
    )
  );

GRANT ALL ON TABLE public.mem_start_rec_rel TO service_role;
GRANT SELECT ON TABLE public.mem_start_rec_rel TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 3) 공통코드 칩 덧붙이기 — 기존 코드·순서는 그대로
-- ────────────────────────────────────────────────────────────────
INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, false, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    ('JOIN_PURP', 'FIRST_FINISH', '첫 10K·하프·풀 완주를 하고 싶어요', '가입 목적: 첫 완주', 8),
    ('JOIN_PURP', 'PB', '기록을 단축하고 싶어요', '가입 목적: 기록 단축', 9),
    ('JOIN_PURP', 'HEALTH', '건강·다이어트를 하고 싶어요', '가입 목적: 건강·다이어트', 10),
    ('JOIN_SRC', 'SEARCH', '검색', '유입 경로: 검색', 5),
    ('JOIN_SRC', 'EVENT', '대회', '유입 경로: 대회', 6)
) AS v(grp_cd, cd, cd_nm, cd_desc, sort_ord)
WHERE g.cd_grp_cd = v.grp_cd
  AND g.vers = 0
  AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;

-- '기타'는 계속 맨 끝(새 칩 두 개가 그 앞에 들어온다)
UPDATE public.cmm_cd_mst m
SET sort_ord = 7
FROM public.cmm_cd_grp_mst g
WHERE m.cd_grp_id = g.cd_grp_id AND g.cd_grp_cd = 'JOIN_SRC' AND g.vers = 0
  AND m.cd = 'ETC' AND m.vers = 0 AND m.sort_ord <> 7;
