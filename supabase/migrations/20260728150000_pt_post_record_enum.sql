-- 운동기록(기록 자랑) 등록 포인트 — 활동 종류 enum 추가.
--
-- `ALTER TYPE ... ADD VALUE`로 추가한 값은 **같은 트랜잭션 안에서 사용할 수 없다**(Postgres 제약).
-- 그래서 룰 금액·헬퍼·트리거는 다음 마이그레이션(20260728151000)으로 분리한다.
-- 두 파일은 반드시 순서대로 적용해야 한다.
ALTER TYPE public.pt_actv_type_enm ADD VALUE IF NOT EXISTS 'post_record';
