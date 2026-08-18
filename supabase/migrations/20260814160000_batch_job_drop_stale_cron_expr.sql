-- batch_job_mst.cron_expr 를 비운다 — 이제 아무것도 설명하지 않고, 그나마 **틀린 시각**이었다.
--
-- 두 job에 `0 15 1 * *`가 들어 있었는데 이건 UTC 매월 1일 15시 = **KST 2일 자정**이다.
-- 의도한 "KST 1일 자정"과 하루 어긋난 값이 화면에 "매월 1일 자정 (KST)"으로 찍히고 있었다.
--
-- 실제 스케줄은 두 값이 함께 정한다(설계 docs/design/2026-08-14-배치-자동화.md §3.2):
--   ① 디스패처 크론이 도는 시각 — `vercel.json`의 `/api/cron/batch` (`0 0 * * *` = KST 09:00)
--   ② 이 job의 `freq_cd` — daily면 매일, monthly면 그 달 첫 크론에서 한 번
-- 화면 문구는 `scheduleLabel()`(`lib/batch/schedule.ts`)이 이 둘로 만든다.
--
-- 컬럼 자체는 남긴다 — 나중에 job별로 다른 시각이 필요해지면 쓸 자리다. 다만 **지금은
-- 아무도 안 읽으므로**, 틀린 값을 남겨 두면 다음 사람이 그걸 진실로 믿는다.

UPDATE public.batch_job_mst
   SET cron_expr = NULL,
       upd_at    = now()
 WHERE cron_expr IS NOT NULL;

COMMENT ON COLUMN public.batch_job_mst.cron_expr IS
  '사용하지 않음(2026-08-14). 실제 스케줄은 vercel.json의 디스패처 크론 + freq_cd가 정한다. job별 시각이 필요해지면 이 컬럼을 되살린다.';
