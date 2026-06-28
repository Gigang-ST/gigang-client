-- gthr_mst.short_id 중복 인덱스 제거 (dev·prd 적용).
-- UNIQUE 제약(gthr_mst_short_id_key)이 이미 short_id btree 인덱스를 생성하므로
-- 별도 ix_gthr_mst_short_id는 조회 이득 없이 INSERT/UPDATE 쓰기 비용만 증가시킨다.
DROP INDEX IF EXISTS public.ix_gthr_mst_short_id;
