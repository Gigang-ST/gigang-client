-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- kakao_send_hist.status 에 'duplicate' 추가 — 이슈 #631
--
-- 같은 request_id 로 다시 보내면 허브는 새로 보내지 않고 2xx + duplicate:true 로 답한다
-- (@noti-bot/sdk SendMessageResult.duplicate). 지금까진 그것도 'success' 로 남아, 단톡방엔
-- 1건만 갔는데 발송 이력엔 "접수" 2건이 보였다(2026-11-07 PR #636 미리보기 실측).
-- 중복은 성공·실패와 같은 축의 사실이라 status 에 둔다 — 다른 칸에 표시하면 DB 를 직접 세는
-- 사람이 또 성공으로 센다.
--
-- 데이터는 바꾸지 않는다(이미 쌓인 중복 행은 구분할 근거가 없다).
-- 제약 이름은 20261015020000 의 인라인 CHECK 가 받은 자동 이름(kakao_send_hist_status_check).
-- VALIDATE 는 20261107100100 에서 별도 트랜잭션으로 한다(noti_mst 선례와 같은 이유).
--
-- ⚠️ 배포 순서: 이 마이그레이션을 **앱보다 먼저** 적용한다. 앱이 먼저 나가면 중복 응답의 이력
--    INSERT 가 이 제약에 걸려 행이 안 남는다(발송 자체는 영향 없음 — send-log.ts 가 삼킨다).
-- ============================================================

ALTER TABLE public.kakao_send_hist DROP CONSTRAINT IF EXISTS kakao_send_hist_status_check;

ALTER TABLE public.kakao_send_hist ADD CONSTRAINT kakao_send_hist_status_check
  CHECK (status IN ('success', 'failed', 'duplicate')) NOT VALID;

COMMENT ON COLUMN public.kakao_send_hist.status IS
  'success=허브 접수 / failed=거절·미도달 / duplicate=같은 request_id 가 이미 접수돼 허브가 새로 보내지 않음.';

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- duplicate 행이 있으면 되돌리기 전에 'success' 로 바꿔야 한다(허브 접수는 맞으므로).
--   UPDATE public.kakao_send_hist SET status = 'success' WHERE status = 'duplicate';
--   ALTER TABLE public.kakao_send_hist DROP CONSTRAINT IF EXISTS kakao_send_hist_status_check;
--   ALTER TABLE public.kakao_send_hist ADD CONSTRAINT kakao_send_hist_status_check
--     CHECK (status IN ('success', 'failed'));
-- ============================================================
