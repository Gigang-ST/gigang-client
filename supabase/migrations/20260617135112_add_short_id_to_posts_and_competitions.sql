-- [이력 이관 #713] prd 에만 기록돼 있던 마이그레이션(prd 버전·이름 동일).
-- prd 에는 이미 적용됐다 — 다시 적용하지 않는다. 저장소엔 generate_nanoid() 정의가 없어
-- 20260620150000_gthr_mst_add_short_id 에서 새 DB 가 깨졌다 — 그 앞 버전으로 옮겨 놓는다(멱등).
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION generate_nanoid(size int DEFAULT 7)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  idBuilder text := '';
  i int := 0;
  bytes bytea;
  byte int;
  pos int;
BEGIN
  bytes := gen_random_bytes(size * 2);
  WHILE i < size LOOP
    byte := get_byte(bytes, i);
    pos := (byte % 62) + 1;
    idBuilder := idBuilder || substr(alphabet, pos, 1);
    i := i + 1;
  END LOOP;
  RETURN idBuilder;
END;
$$;

ALTER TABLE sch_post_mst
  ADD COLUMN IF NOT EXISTS short_id text UNIQUE DEFAULT generate_nanoid();
UPDATE sch_post_mst SET short_id = generate_nanoid() WHERE short_id IS NULL;

ALTER TABLE comp_mst
  ADD COLUMN IF NOT EXISTS short_id text UNIQUE DEFAULT generate_nanoid();
UPDATE comp_mst SET short_id = generate_nanoid() WHERE short_id IS NULL;
