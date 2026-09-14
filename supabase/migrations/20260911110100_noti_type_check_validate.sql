-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- noti_mst_noti_type_enm_check 검증 — 20260911110000 에서 NOT VALID 로 추가한 제약
--
-- 같은 파일에 두지 않는 이유: 한 트랜잭션이면 DROP CONSTRAINT 가 잡은 ACCESS EXCLUSIVE 가
-- VALIDATE 스캔이 끝날 때까지 유지돼 noti_mst 읽기·쓰기가 전부 대기한다. 분리하면 VALIDATE 는
-- SHARE UPDATE EXCLUSIVE 만 잡아 일반 읽기·쓰기를 막지 않는다
-- (supabase/migrations/README.md "위험 변경" STEP 3/4).
-- ============================================================

ALTER TABLE public.noti_mst VALIDATE CONSTRAINT noti_mst_noti_type_enm_check;
