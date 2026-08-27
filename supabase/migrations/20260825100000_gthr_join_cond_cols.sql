-- ============================================================
-- 모임 참여조건 · 운영진 승인제 — ① gthr_mst 옵션 컬럼
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §3.1
--
-- 두 옵션은 서로 독립이다(조건만 / 승인만 / 둘 다). 기본값이 전부 "꺼짐"이라
-- 기존 모임은 이 마이그레이션으로 아무것도 바뀌지 않는다 — 백필 없음.
-- ============================================================

ALTER TABLE public.gthr_mst
  ADD COLUMN IF NOT EXISTS aprv_req_yn     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS req_attd_cnt    int,
  ADD COLUMN IF NOT EXISTS req_attd_months int;

COMMENT ON COLUMN public.gthr_mst.aprv_req_yn
  IS '운영진 승인제 여부. true면 신청→승인을 거쳐야 참가 확정(gthr_attd_rel 진입).';
COMMENT ON COLUMN public.gthr_mst.req_attd_cnt
  IS '참여조건: 최근 req_attd_months 개월간 필요한 모임 참석 횟수. NULL = 조건 없음.';
COMMENT ON COLUMN public.gthr_mst.req_attd_months
  IS '참여조건: 집계 구간(개월). req_attd_cnt 와 함께만 의미를 가진다.';

-- 조건은 "횟수 + 기간"이 한 몸이다. 한쪽만 채워지면 화면 문구도 판정도 만들 수 없다.
ALTER TABLE public.gthr_mst
  DROP CONSTRAINT IF EXISTS ck_gthr_mst_req_attd;
ALTER TABLE public.gthr_mst
  ADD CONSTRAINT ck_gthr_mst_req_attd
  CHECK ((req_attd_cnt IS NULL) = (req_attd_months IS NULL));

-- 값 범위 — 0회/0개월은 "조건 없음"과 구분되지 않으므로 1 이상.
-- 상한은 UI 셀렉트 범위와 맞춘다(횟수 100, 기간 36개월).
ALTER TABLE public.gthr_mst
  DROP CONSTRAINT IF EXISTS ck_gthr_mst_req_attd_range;
ALTER TABLE public.gthr_mst
  ADD CONSTRAINT ck_gthr_mst_req_attd_range
  CHECK (
    (req_attd_cnt    IS NULL OR (req_attd_cnt    BETWEEN 1 AND 100)) AND
    (req_attd_months IS NULL OR (req_attd_months BETWEEN 1 AND 36))
  );

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- ALTER TABLE public.gthr_mst DROP CONSTRAINT IF EXISTS ck_gthr_mst_req_attd_range;
-- ALTER TABLE public.gthr_mst DROP CONSTRAINT IF EXISTS ck_gthr_mst_req_attd;
-- ALTER TABLE public.gthr_mst
--   DROP COLUMN IF EXISTS req_attd_months,
--   DROP COLUMN IF EXISTS req_attd_cnt,
--   DROP COLUMN IF EXISTS aprv_req_yn;
-- ============================================================
