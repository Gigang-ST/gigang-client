-- ttl_mst에 ttl_group_cd 컬럼 추가
-- 같은 그룹 내에서 최고 rarity 칭호만 선택 가능 (도감 방식).
-- NULL이면 독립 선택 (그룹 경쟁 없음).
-- 그룹 번호 예시: 1=러닝등급, 2=트레일등급, 3=철인3종등급, 10=러닝완주횟수, ...
-- 정렬: ttl_ctgr_cd → ttl_group_cd (NULL 후순위) → sort_ord
ALTER TABLE public.ttl_mst
  ADD COLUMN IF NOT EXISTS ttl_group_cd smallint;
