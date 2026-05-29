-- ============================================================
-- 칭호 등급 시스템 v2
-- effect_cd → rarity_level(1~10) 구조 변경
-- effect_mst 신규, team_mem_rel 이펙트 선택 컬럼 추가
-- ============================================================

-- 1. ttl_mst: effect_cd 제거, rarity_level 추가
ALTER TABLE public.ttl_mst
  DROP COLUMN IF EXISTS effect_cd,
  ADD COLUMN IF NOT EXISTS rarity_level smallint NOT NULL DEFAULT 1;

ALTER TABLE public.ttl_mst
  ADD CONSTRAINT ttl_mst_rarity_level_check
    CHECK (rarity_level BETWEEN 1 AND 10);

-- 2. effect_mst: 이펙트 마스터 테이블 신규
CREATE TABLE IF NOT EXISTS public.effect_mst (
  effect_cd    text        NOT NULL,
  effect_nm    text        NOT NULL,
  effect_type  text        NOT NULL, -- 'badge' | 'frame'
  rarity_level smallint    NOT NULL,
  sort_ord     integer     NOT NULL DEFAULT 0,
  use_yn       boolean     NOT NULL DEFAULT true,
  CONSTRAINT pk_effect_mst PRIMARY KEY (effect_cd),
  CONSTRAINT ck_effect_mst_type CHECK (effect_type IN ('badge', 'frame')),
  CONSTRAINT ck_effect_mst_level CHECK (rarity_level BETWEEN 1 AND 10)
);

COMMENT ON TABLE public.effect_mst IS '이펙트 마스터 (배지/프레임). 등급 1~10으로 관리';

-- 3. team_mem_rel: 유저 이펙트 선택 컬럼 추가
ALTER TABLE public.team_mem_rel
  ADD COLUMN IF NOT EXISTS selected_badge_effect text,
  ADD COLUMN IF NOT EXISTS selected_frame_cd     text;

-- 4. RLS: effect_mst는 로그인한 멤버 누구나 읽기 가능
ALTER TABLE public.effect_mst ENABLE ROW LEVEL SECURITY;

CREATE POLICY "effect_mst_select_authenticated"
  ON public.effect_mst
  FOR SELECT
  TO authenticated
  USING (true);
