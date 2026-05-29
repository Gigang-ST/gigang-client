-- 칭호 카탈로그 시드: 이벤트(event) 칭호 및 수여(awarded) 칭호 초기 데이터
-- 기강단장·행동대장: ttl_ctgr_cd = 'event'
-- 서브현근·맛객·순간포착: ttl_ctgr_cd = 'awarded'

INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  base_pt, sort_ord, use_yn, rarity_level,
  vers, del_yn
)
SELECT
  v.team_id::uuid,
  v.ttl_kind_enm::public.ttl_kind_enm,
  v.ttl_ctgr_cd,
  v.ttl_nm,
  v.ttl_desc,
  v.base_pt::integer,
  v.sort_ord::integer,
  true,
  v.rarity_level::smallint,
  0,
  false
FROM (
  VALUES
    ('c0ffee00-0000-4000-8000-000000000001', 'awarded', 'event',   '기강단장',  '기강 러닝크루 모임장 칭호',    '0', '1',  '5'),
    ('c0ffee00-0000-4000-8000-000000000001', 'awarded', 'event',   '행동대장',  '기강 러닝크루 운영진 칭호',    '0', '2',  '4'),
    ('c0ffee00-0000-4000-8000-000000000001', 'awarded', 'awarded', '서브현근',  '출석 부문 서브 현근 수상 칭호', '0', '10', '3'),
    ('c0ffee00-0000-4000-8000-000000000001', 'awarded', 'awarded', '맛객',     '미식 탐방 부문 수상 칭호',     '0', '11', '3'),
    ('c0ffee00-0000-4000-8000-000000000001', 'awarded', 'awarded', '순간포착',  '사진 부문 수상 칭호',         '0', '12', '3')
) AS v(team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc, base_pt, sort_ord, rarity_level)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = v.team_id::uuid
    AND t.ttl_nm  = v.ttl_nm
    AND t.vers    = 0
    AND t.del_yn  = false
);
