-- batch_job_mst.freq_cd — 크론이 "오늘 이 배치를 돌 차례인가"를 판정하는 주기 코드.
--
-- 배경(설계 docs/design/2026-08-14-배치-자동화.md §3.2):
--   `cron_expr`을 그대로 파싱하지 않는다. `0 15 1 * *`는 UTC 매월 1일 15시 = **KST 2일 자정**이고,
--   의도한 "KST 1일 자정"은 UTC로 전월 말일 15시인데 말일이 28~31로 변해 표준 cron으로 표현이 안 된다.
--   대신 **"이번 주기에 이미 성공했나"**로 판정한다:
--     'daily'   → 오늘(KST) success 이력이 없으면 실행
--     'monthly' → 이번 달(KST) success 이력이 없으면 실행
--     null      → 자동 실행 안 함 (관리자 화면 수동 전용)
--   크론이 하루 밀리거나 실패해도 다음 날 따라잡고(catch-up), 단장이 먼저 손으로 돌렸으면
--   자동은 그냥 건너뛴다(멱등성이 공짜로 따라온다).
--
--   `cron_expr`은 지우지 않는다 — 관리자 화면이 주기를 표시하는 데 쓴다.
--
-- ⚠️ 주기 체크는 **자동 실행에만** 적용한다. 수동 실행 버튼은 이 값과 무관하게 항상 돈다
--   (§3.7) — 자동이 한 번 돈 뒤에 손으로 다시 못 돌리면 곤란한 순간이 정확히 그때다.

ALTER TABLE public.batch_job_mst
  ADD COLUMN freq_cd VARCHAR;

ALTER TABLE public.batch_job_mst
  ADD CONSTRAINT batch_job_mst_freq_cd_chk
  CHECK (freq_cd IS NULL OR freq_cd IN ('daily', 'monthly'));

COMMENT ON COLUMN public.batch_job_mst.freq_cd IS
  '자동 실행 주기: daily | monthly | null(수동 전용). 크론은 "이번 주기에 success 이력이 있나"로 실행 여부를 정한다(설계 §3.2).';

-- 기존 2건은 월 마감 배치다(전월 확정 → 매월 1회).
UPDATE public.batch_job_mst
   SET freq_cd = 'monthly',
       upd_at  = now()
 WHERE job_cd IN ('DUES_EXEMPTION_BATCH', 'MILEAGE_TITLE_BATCH');
