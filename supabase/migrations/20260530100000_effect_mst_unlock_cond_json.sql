-- ============================================================
-- effect_mst: unlock_cond_json 컬럼 추가
-- rarity_level은 어드민 분류·컬렉션 정렬 전용으로 유지
-- 해금 조건은 unlock_cond_json으로 관리
--
-- null         = 해금 불가 (조건 미설정)
-- {"type":"rarity","level":N} = N등급 이상 칭호 보유 시 해금
-- 추후 {"type":"title","ttl_nm":"..."}, {"type":"point","amount":N} 확장 예정
-- ============================================================

ALTER TABLE public.effect_mst
  ADD COLUMN IF NOT EXISTS unlock_cond_json jsonb DEFAULT NULL;

COMMENT ON COLUMN public.effect_mst.unlock_cond_json IS
  '해금 조건 JSON. null=해금 불가(미설정), {"type":"rarity","level":N}=N등급 이상 칭호 보유, 추후 point/title 타입 확장 예정';

-- use_yn=true인 이펙트만 기존 rarity_level 값으로 등급 조건 설정
-- use_yn=false(임시 잠금)는 null 유지 → 소스코드 전환 후 unlock_cond_json으로만 잠금 관리
UPDATE public.effect_mst
SET unlock_cond_json = jsonb_build_object('type', 'rarity', 'level', rarity_level)
WHERE use_yn = true;
