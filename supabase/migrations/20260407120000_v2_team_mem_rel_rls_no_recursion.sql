-- team_mem_rel RLS: 정책 본문에서 team_mem_rel 를 다시 스캔하면 동일 SELECT 정책이 재귀 적용되어 42P17(infinite recursion) 발생.
-- mem_mst_select_same_team → team_mem_rel 조인, team_mst 정책의 EXISTS 등이 연쇄적으로 같은 문제를 일으킨다.
-- 해결: team_mem_rel 를 RLS 우회로 읽는 STABLE SECURITY DEFINER 헬퍼 + 정책을 함수 호출로 교체.

CREATE OR REPLACE FUNCTION public.v2_rls_auth_in_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_mem_rel r
    WHERE r.team_id = p_team_id
      AND r.mem_id = (SELECT auth.uid())
      AND r.vers = 0
      AND r.del_yn = false
  );
$$;

CREATE OR REPLACE FUNCTION public.v2_rls_auth_team_owner_or_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_mem_rel r
    WHERE r.team_id = p_team_id
      AND r.mem_id = (SELECT auth.uid())
      AND r.team_role_cd IN ('owner', 'admin')
      AND r.vers = 0
      AND r.del_yn = false
  );
$$;

CREATE OR REPLACE FUNCTION public.v2_rls_auth_shares_team_with_mem(p_peer_mem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_mem_rel r_self
    INNER JOIN public.team_mem_rel r_peer
      ON r_self.team_id = r_peer.team_id
     AND r_peer.mem_id = p_peer_mem_id
    WHERE r_self.mem_id = (SELECT auth.uid())
      AND r_self.vers = 0
      AND r_self.del_yn = false
      AND r_peer.vers = 0
      AND r_peer.del_yn = false
  );
$$;

ALTER FUNCTION public.v2_rls_auth_in_team(uuid) OWNER TO postgres;
ALTER FUNCTION public.v2_rls_auth_team_owner_or_admin(uuid) OWNER TO postgres;
ALTER FUNCTION public.v2_rls_auth_shares_team_with_mem(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.v2_rls_auth_in_team(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_rls_auth_team_owner_or_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_rls_auth_shares_team_with_mem(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v2_rls_auth_in_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v2_rls_auth_team_owner_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v2_rls_auth_shares_team_with_mem(uuid) TO authenticated;

COMMENT ON FUNCTION public.v2_rls_auth_in_team(uuid) IS
  'RLS용: 호출자(auth.uid())가 vers=0 활성 team_mem_rel 로 해당 team_id 에 소속인지 (team_mem_rel 정책 재귀 방지)';
COMMENT ON FUNCTION public.v2_rls_auth_team_owner_or_admin(uuid) IS
  'RLS용: 호출자가 해당 팀 owner/admin 인지 (team_mem_rel 정책 재귀 방지)';
COMMENT ON FUNCTION public.v2_rls_auth_shares_team_with_mem(uuid) IS
  'RLS용: 호출자와 peer mem_id 가 동일 팀(vers=0)에 속하는지 — mem_mst 동료 조회 정책용';

-- team_mem_rel
DROP POLICY IF EXISTS team_mem_rel_select_teammate ON public.team_mem_rel;
CREATE POLICY team_mem_rel_select_teammate
  ON public.team_mem_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_in_team(team_id)
  );

DROP POLICY IF EXISTS team_mem_rel_insert_admin ON public.team_mem_rel;
CREATE POLICY team_mem_rel_insert_admin
  ON public.team_mem_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (public.v2_rls_auth_team_owner_or_admin(team_id));

DROP POLICY IF EXISTS team_mem_rel_update_admin_or_self ON public.team_mem_rel;
CREATE POLICY team_mem_rel_update_admin_or_self
  ON public.team_mem_rel
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND (
      mem_id = auth.uid()
      OR public.v2_rls_auth_team_owner_or_admin(team_id)
    )
  )
  WITH CHECK (
    public.v2_rls_auth_team_owner_or_admin(team_id)
    OR mem_id = auth.uid()
  );

-- team_mst (동일 EXISTS 패턴이 team_mem_rel RLS 재귀에 연루됨)
DROP POLICY IF EXISTS team_mst_select_member ON public.team_mst;
CREATE POLICY team_mst_select_member
  ON public.team_mst
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_in_team(team_id)
  );

DROP POLICY IF EXISTS team_mst_update_admin ON public.team_mst;
CREATE POLICY team_mst_update_admin
  ON public.team_mst
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_team_owner_or_admin(team_id)
  )
  WITH CHECK (
    del_yn = false
    AND public.v2_rls_auth_team_owner_or_admin(team_id)
  );

-- mem_mst: 동료 조회 (team_mem_rel 이중 스캔 → 재귀)
DROP POLICY IF EXISTS mem_mst_select_same_team ON public.mem_mst;
CREATE POLICY mem_mst_select_same_team
  ON public.mem_mst
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_shares_team_with_mem(mem_id)
  );

COMMENT ON POLICY team_mem_rel_select_teammate ON public.team_mem_rel IS
  '팀원 조회: v2_rls_auth_in_team 으로 재귀 없이 소속 검증';
COMMENT ON POLICY mem_mst_select_same_team ON public.mem_mst IS
  '동일 팀(vers=0) 소속 간 프로필 조회 — v2_rls_auth_shares_team_with_mem';
