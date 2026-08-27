-- ============================================================
-- 모임 참여조건 — 기간(req_attd_months)을 **선택값**으로 완화
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §3.1
--
-- 조건의 주인은 **횟수**다. 기간은 비우면 "전체 기간"(가입 이후 누적)이라는 뜻이고,
-- 채우면 최근 N개월로 좁힌다. 반대로 기간만 있고 횟수가 없으면 판정할 대상이 없으므로
-- 그 조합만 계속 막는다.
--
-- ⚠️ 이 파일은 20260825100000 의 `(cnt IS NULL) = (months IS NULL)` 를 대체한다.
--    앱(zod `reqAttdPaired` · `hasJoinCondition` · `joinConditionLabel` · 폼의 "전체"
--    placeholder)은 이미 횟수만 있는 조건을 지원하므로, 이 완화가 없으면 그 조합이
--    23514 check_violation 으로 죽는다(사용자에겐 그냥 "저장 실패"로 보인다).
-- ============================================================

ALTER TABLE public.gthr_mst DROP CONSTRAINT IF EXISTS ck_gthr_mst_req_attd;
ALTER TABLE public.gthr_mst
  ADD CONSTRAINT ck_gthr_mst_req_attd
  CHECK (req_attd_months IS NULL OR req_attd_cnt IS NOT NULL);

COMMENT ON COLUMN public.gthr_mst.req_attd_months
  IS '참여조건: 집계 구간(개월). NULL = 전체 기간 누적. req_attd_cnt 없이 단독으로는 쓸 수 없다.';

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- ALTER TABLE public.gthr_mst DROP CONSTRAINT IF EXISTS ck_gthr_mst_req_attd;
-- ALTER TABLE public.gthr_mst ADD CONSTRAINT ck_gthr_mst_req_attd
--   CHECK ((req_attd_cnt IS NULL) = (req_attd_months IS NULL));
-- ============================================================
