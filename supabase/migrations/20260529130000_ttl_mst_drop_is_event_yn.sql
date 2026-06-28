-- is_event_yn 컬럼 제거: ttl_ctgr_cd = 'event'로 이벤트 칭호를 충분히 구분할 수 있음
ALTER TABLE public.ttl_mst
  DROP COLUMN IF EXISTS is_event_yn;
