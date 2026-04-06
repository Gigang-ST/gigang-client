-- prd 컷오버: public.mem_mst.mem_id → auth.users(id) FK 재부착
-- 선행: `20260404102201_v2_backfill_p1_mem_mst.sql` 등으로 FK 가 제거된 상태일 수 있음
-- 적용: 승인된 창구·백업 후, Supabase SQL Editor 또는 psql (service role / postgres)
-- 주의: **dev** 에 고아 mem_id 가 남아 있으면 3단계 VALIDATE 가 실패함 → prd 위주 실행 권장
-- 진행 절차·검증: .claude/docs/database-schema-v2-rollout-progress.md §5.6

-- ---------------------------------------------------------------------------
-- 0) 고아 행 진단 (기대: 0건. 0이 아니면 Auth 동기화·정리 후 아래 1~2 재실행)
-- ---------------------------------------------------------------------------
SELECT mm.mem_id AS orphan_mem_id
FROM public.mem_mst mm
WHERE mm.vers = 0
  AND mm.del_yn = false
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = mm.mem_id);

-- ---------------------------------------------------------------------------
-- 1) FK 추가 (기존 행은 당장 검사하지 않음 — NOT VALID)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'fk_mem_mst__auth_users'
      AND n.nspname = 'public'
      AND t.relname = 'mem_mst'
  ) THEN
    ALTER TABLE public.mem_mst
      ADD CONSTRAINT fk_mem_mst__auth_users
      FOREIGN KEY (mem_id)
      REFERENCES auth.users (id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) 기존 행 전부 검사 (고아가 있으면 여기서 실패 → 0단계 쿼리로 원인 추적)
-- ---------------------------------------------------------------------------
ALTER TABLE public.mem_mst
  VALIDATE CONSTRAINT fk_mem_mst__auth_users;

-- ---------------------------------------------------------------------------
-- 롤백 (필요 시만)
-- ---------------------------------------------------------------------------
-- ALTER TABLE public.mem_mst DROP CONSTRAINT IF EXISTS fk_mem_mst__auth_users;
