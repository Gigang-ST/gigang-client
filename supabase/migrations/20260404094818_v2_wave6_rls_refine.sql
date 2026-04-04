-- v2 웨이브 6: RLS 보강·레거시 플랫폼 관리자 검사 통합·공통 트리거 설명
-- 기준: .claude/docs/database-schema-v2-rollout-progress.md §웨이브 6
-- 선행: 20260404083704_v2_wave3_competition.sql (comp_mst/comp_evt_cfg RLS·정책)
-- 원격 버전: schema_migrations 20260404094818 (로컬 파일명과 동일하게 유지)
-- 비고: 대회/참가/기록 본문 RLS·GRANT·set_v2_upd_at 트리거는 웨이브 2–5에 포함됨.
--       본 웨이브는 레거시 member.admin 중복 표현을 함수로 묶고, 공통 트리거 의미를 COMMENT로 고정한다.

-- 레거시 competition 관리자와 동일: member.admin + 카카오/구글 UID = auth.uid()
CREATE OR REPLACE FUNCTION public.is_legacy_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member m
    WHERE m.admin = true
      AND (m.kakao_user_id = auth.uid() OR m.google_user_id = auth.uid())
  );
$$;

ALTER FUNCTION public.is_legacy_platform_admin() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.is_legacy_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_legacy_platform_admin() TO authenticated;

COMMENT ON FUNCTION public.is_legacy_platform_admin() IS '레거시 member.admin + OAuth UID 일치. comp_mst/comp_evt_cfg 전역 CUD용. v2 플랫폼 관리자 모델 확정 시 교체 예정.';

COMMENT ON FUNCTION public.set_v2_upd_at() IS 'v2 공통: BEFORE UPDATE 시 NEW.upd_at = now(). updated_at 컬럼 없이 upd_at만 사용하는 테이블에 부착.';

DROP POLICY IF EXISTS comp_mst_mutate_legacy_admin ON public.comp_mst;

CREATE POLICY comp_mst_mutate_legacy_admin
  ON public.comp_mst
  FOR ALL
  TO authenticated
  USING (public.is_legacy_platform_admin())
  WITH CHECK (public.is_legacy_platform_admin());

DROP POLICY IF EXISTS comp_evt_cfg_mutate_legacy_admin ON public.comp_evt_cfg;

CREATE POLICY comp_evt_cfg_mutate_legacy_admin
  ON public.comp_evt_cfg
  FOR ALL
  TO authenticated
  USING (public.is_legacy_platform_admin())
  WITH CHECK (public.is_legacy_platform_admin());
