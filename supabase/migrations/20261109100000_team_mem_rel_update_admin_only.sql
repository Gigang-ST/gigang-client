-- team_mem_rel UPDATE 정책에서 "본인" 갈래를 걷어낸다.
--
-- 기존 `team_mem_rel_update_admin_or_self`는 본인 행 UPDATE를 컬럼 제한 없이 열어 두어,
-- 로그인한 회원이 Supabase API로 직접 자기 행의 `team_role_cd`(→ owner), `mem_st_cd`
-- (비활성·탈퇴 → active), `team_id`(다른 팀으로 이동), `leave_dt` 등을 바꿀 수 있었다.
--
-- 앱에서 본인 행을 고치는 경로(한마디·꾸미기 = `app/actions/profile/update-collection.ts`)는
-- 전부 service_role(관리자 클라이언트)이고, 상태·역할 변경 RPC(`apply_team_mem_rel_change` /
-- `apply_team_mem_rel_delete`)는 SECURITY DEFINER라 이 정책을 거치지 않는다
-- (2026-11-09 prd 전수 확인). 그래서 본인 갈래는 쓰는 곳 없이 구멍으로만 남아 있었다.
--
-- 관리자 갈래는 그대로 둔다(같은 팀 owner/admin만).
SET lock_timeout = '3s';

DROP POLICY IF EXISTS team_mem_rel_update_admin_or_self ON public.team_mem_rel;
DROP POLICY IF EXISTS team_mem_rel_update_admin ON public.team_mem_rel;

CREATE POLICY team_mem_rel_update_admin
  ON public.team_mem_rel
  FOR UPDATE
  TO authenticated
  USING ((del_yn = false) AND v2_rls_auth_team_owner_or_admin(team_id))
  WITH CHECK (v2_rls_auth_team_owner_or_admin(team_id));

COMMENT ON POLICY team_mem_rel_update_admin ON public.team_mem_rel IS
  '같은 팀 owner/admin만 UPDATE. 본인 갈래는 등급·상태 셀프 변경 구멍이라 제거(2026-11-09). 본인 필드(한마디·꾸미기)는 서버 액션이 service_role로 쓴다.';
