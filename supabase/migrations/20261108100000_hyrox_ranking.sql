-- 기강의 전당에 하이록스(HYROX) 판을 연다 (#349)
--
-- 하이록스는 **대회 기록만** 받는다(연습 기록은 넣지 않는다 — 2026-11-08 확정). 그래서 새 테이블 없이
-- 기존 대회 기록(rec_race_hist)을 그대로 쓴다: 대회 등록 → 참가 → 기록 입력 → 포인트 트리거 → 칭호가
-- 전부 공통코드만 늘리면 따라온다(comp_mst.comp_sprt_cd 는 COMP_SPRT_CD 공통코드 트리거로 검증된다).
--
-- 바꾸는 것:
--   ① rec_race_hist.splits_json — 8개 스테이션 구간 기록 {스테이션코드: 초}. 선택값, 다른 종목은 NULL.
--      철인 split 처럼 컬럼을 늘리지 않는 이유: 스테이션이 8개라 컬럼 8개가 다른 종목엔 모두 빈 칸이 된다.
--      키 목록의 정본은 lib/hyrox.ts 의 HYROX_STATIONS.
--   ② 공통코드 — COMP_SPRT_CD 에 hyrox, 새 그룹 HYROX_EVT_CD(OPEN·PRO·DOUBLES·RELAY).
--      앱 매핑은 lib/comp-sprt-to-evt-grp.ts.
--   ③ get_public_team_race_rankings — 하이록스 대회의 OPEN 등을 HYROX_OPEN 등으로 바꿔 내린다
--      (철인 #581 과 같은 방식). TS 거울은 lib/comp-evt-type.ts 의 toRankingEvtCd().
--   ④ get_public_team_hyrox_rankings — 하이록스 판 전용. 스플릿과 기록 PK 를 같이 내린다.
--      ③의 반환 모양을 바꾸려면 DROP 이 필요해서(반환 타입 변경은 CREATE OR REPLACE 불가) 따로 둔다.
--
-- 참고: 같은 기능의 옛 마이그레이션(add_hyrox_sport_and_splits_json)은 dev 에만 적용됐다가
-- 20260627160000_rollback_hyrox_sport_and_splits_json 로 걷혔다. 이 파일은 그것과 무관하게 멱등이다.
SET lock_timeout = '3s';

-- ① 스테이션 스플릿 ------------------------------------------------------------
ALTER TABLE public.rec_race_hist ADD COLUMN IF NOT EXISTS splits_json jsonb;

COMMENT ON COLUMN public.rec_race_hist.splits_json IS
  '하이록스 스테이션 구간 기록 {SKIERG|SLED_PUSH|SLED_PULL|BURPEE|ROW|FARMERS_CARRY|LUNGE|WALL_BALL: 초}. 선택값, 다른 종목은 NULL';

-- ② 공통코드 -------------------------------------------------------------------
-- 하이록스 스포츠 — 기존 순서를 흔들지 않게 맨 뒤에 붙인다
INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, 'hyrox', '하이록스', NULL,
       COALESCE((SELECT max(m.sort_ord) FROM public.cmm_cd_mst m
                 WHERE m.cd_grp_id = g.cd_grp_id AND m.vers = 0 AND m.del_yn = false), 0) + 1,
       false, 0, false
FROM public.cmm_cd_grp_mst g
WHERE g.cd_grp_cd = 'COMP_SPRT_CD' AND g.vers = 0 AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;

INSERT INTO public.cmm_cd_grp_mst (cd_grp_cd, cd_grp_nm, sort_ord, vers, del_yn)
VALUES ('HYROX_EVT_CD', '하이록스 이벤트 코드', 46, 0, false)
ON CONFLICT (cd_grp_cd, vers) DO NOTHING;

INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, v.is_default_yn, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    ('OPEN', 'OPEN', '하이록스 오픈', 1, true),
    ('PRO', 'PRO', '하이록스 프로', 2, false),
    ('DOUBLES', 'DOUBLES', '하이록스 더블스', 3, false),
    ('RELAY', 'RELAY', '하이록스 릴레이', 4, false)
) AS v(cd, cd_nm, cd_desc, sort_ord, is_default_yn)
WHERE g.cd_grp_cd = 'HYROX_EVT_CD' AND g.vers = 0 AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;

-- ③ 전체 랭킹 RPC — 하이록스 코드에 접두어 ----------------------------------------
-- 20261012100000_race_rankings_triathlon_evt_cd.sql 본문에 하이록스 분기만 더했다.
CREATE OR REPLACE FUNCTION public.get_public_team_race_rankings(
  p_team_id uuid
)
RETURNS TABLE (
  mem_id uuid,
  mem_nm text,
  gdr_enm public.gender,
  evt_cd text,
  rec_time_sec integer,
  race_nm text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rr.mem_id,
    mm.mem_nm,
    mm.gdr_enm,
    CASE
      WHEN cm.comp_sprt_cd = 'triathlon'
       AND upper(btrim(ce.comp_evt_type)) IN ('FULL', 'HALF', 'OLYMPIC', 'SPRINT')
      THEN 'TRIATHLON_' || upper(btrim(ce.comp_evt_type))
      -- 하이록스 부문은 다른 종목 코드와 겹칠 일이 없지만, 랭킹 코드는 스포츠가 드러나게 접두어를 붙인다
      WHEN cm.comp_sprt_cd = 'hyrox'
       AND upper(btrim(ce.comp_evt_type)) IN ('OPEN', 'PRO', 'DOUBLES', 'RELAY')
      THEN 'HYROX_' || upper(btrim(ce.comp_evt_type))
      ELSE COALESCE(ce.comp_evt_type, 'UNKNOWN')
    END AS evt_cd,
    rr.rec_time_sec,
    rr.race_nm
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm
    ON tm.mem_id = rr.mem_id
   AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active'
   AND tm.vers = 0
   AND tm.del_yn = false
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = rr.mem_id
   AND mm.vers = 0
   AND mm.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id
   AND ce.vers = 0
   AND ce.del_yn = false
  LEFT JOIN public.comp_mst cm
    ON cm.comp_id = rr.comp_id
  WHERE rr.vers = 0
    AND rr.del_yn = false
    -- 크루 가입일 이전 기록은 랭킹에 세우지 않는다 (#528)
    AND (tm.join_dt IS NULL OR rr.race_dt >= tm.join_dt);
$$;

-- ④ 하이록스 판 전용 RPC --------------------------------------------------------
-- 필터(활동 회원·가입일 이후·소프트삭제 제외)는 ③과 같다 — 한쪽을 고치면 다른 쪽도 고친다.
-- race_result_id 는 유일 정렬 키다(앱이 fetchAllRows 로 끝까지 읽는다).
CREATE OR REPLACE FUNCTION public.get_public_team_hyrox_rankings(
  p_team_id uuid
)
RETURNS TABLE (
  race_result_id uuid,
  mem_id uuid,
  mem_nm text,
  gdr_enm public.gender,
  evt_cd text,
  rec_time_sec integer,
  race_nm text,
  race_dt date,
  splits_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rr.race_result_id,
    rr.mem_id,
    mm.mem_nm,
    mm.gdr_enm,
    'HYROX_' || upper(btrim(ce.comp_evt_type)) AS evt_cd,
    rr.rec_time_sec,
    rr.race_nm,
    rr.race_dt,
    rr.splits_json
  FROM public.rec_race_hist rr
  INNER JOIN public.comp_mst cm
    ON cm.comp_id = rr.comp_id
   AND cm.comp_sprt_cd = 'hyrox'
  INNER JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id
   AND ce.vers = 0
   AND ce.del_yn = false
  INNER JOIN public.team_mem_rel tm
    ON tm.mem_id = rr.mem_id
   AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active'
   AND tm.vers = 0
   AND tm.del_yn = false
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = rr.mem_id
   AND mm.vers = 0
   AND mm.del_yn = false
  WHERE rr.vers = 0
    AND rr.del_yn = false
    AND (tm.join_dt IS NULL OR rr.race_dt >= tm.join_dt);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_hyrox_rankings(uuid) TO anon, authenticated, service_role;
