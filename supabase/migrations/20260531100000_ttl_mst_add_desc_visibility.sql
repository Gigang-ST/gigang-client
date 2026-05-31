-- ttl_mst에 칭호 설명 공개 범위 컬럼 추가
-- always: 미보유여도 항상 설명 공개 (내 컬렉션 포함)
-- others: 다른 사람이 보유한 경우에만 설명 공개 (기본값)
-- held:   본인이 보유한 경우에만 설명 공개
-- never:  보유해도 항상 ??? (획득해도 모름)

ALTER TABLE ttl_mst
  ADD COLUMN IF NOT EXISTS desc_visibility VARCHAR NOT NULL DEFAULT 'others'
  CHECK (desc_visibility IN ('always', 'others', 'held', 'never'));
