-- ttl_mst 테이블에 effect_cd 컬럼 추가
-- 칭호 이펙트: none(기본), neon(네온), hologram(홀로그램), gold(골드), spark(스파크)

ALTER TABLE public.ttl_mst
  ADD COLUMN IF NOT EXISTS effect_cd text NOT NULL DEFAULT 'none';

ALTER TABLE public.ttl_mst
  ADD CONSTRAINT ttl_mst_effect_cd_check
    CHECK (effect_cd IN ('none', 'neon', 'hologram', 'gold', 'spark'));
