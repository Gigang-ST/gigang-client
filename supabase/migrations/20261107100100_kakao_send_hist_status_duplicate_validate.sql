-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- kakao_send_hist_status_check 검증 — 20261107100000 에서 NOT VALID 로 추가한 제약.
-- 같은 파일에 두면 DROP CONSTRAINT 의 ACCESS EXCLUSIVE 가 검증 스캔 끝까지 유지된다
-- (supabase/migrations/README.md "위험 변경" STEP 3/4).
ALTER TABLE public.kakao_send_hist VALIDATE CONSTRAINT kakao_send_hist_status_check;
