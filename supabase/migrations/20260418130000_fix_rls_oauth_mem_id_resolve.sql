-- fix: v2_rls_auth 함수들이 레거시 회원(mem_id ≠ auth.uid())도 인식하도록 수정
-- 배경: mem_mst.oauth_kakao_id/oauth_google_id로 연결된 회원은 mem_id ≠ auth.uid()
--       → team_mem_rel RLS에서 mem_id = auth.uid() 매칭 실패 → 비회원 처리
-- 해결: mem_mst를 JOIN해서 oauth ID로도 mem_id를 찾도록 확장

-- 헬퍼: auth.uid() → 실제 mem_id 변환 (oauth 컬럼 포함)
CREATE OR REPLACE FUNCTION public.v2_rls_resolve_mem_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT m.mem_id
  FROM public.mem_mst m
  WHERE m.vers = 0
    AND m.del_yn = false
    AND (
      m.mem_id = auth.uid()
      OR m.oauth_kakao_id = auth.uid()
      OR m.oauth_google_id = auth.uid()
    )
  LIMIT 1;
$$;

-- v2_rls_auth_in_team: 팀 소속 확인
CREATE OR REPLACE FUNCTION public.v2_rls_auth_in_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_mem_rel r
    WHERE r.team_id = p_team_id
      AND r.mem_id = v2_rls_resolve_mem_id()
      AND r.vers = 0
      AND r.del_yn = false
  );
$$;

-- v2_rls_auth_shares_team_with_mem: 같은 팀 소속 확인
CREATE OR REPLACE FUNCTION public.v2_rls_auth_shares_team_with_mem(p_peer_mem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_mem_rel r_self
    INNER JOIN public.team_mem_rel r_peer
      ON r_self.team_id = r_peer.team_id
     AND r_peer.mem_id = p_peer_mem_id
    WHERE r_self.mem_id = v2_rls_resolve_mem_id()
      AND r_self.vers = 0
      AND r_self.del_yn = false
      AND r_peer.vers = 0
      AND r_peer.del_yn = false
  );
$$;

-- v2_rls_auth_team_owner_or_admin: 팀 관리자 확인
CREATE OR REPLACE FUNCTION public.v2_rls_auth_team_owner_or_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_mem_rel r
    WHERE r.team_id = p_team_id
      AND r.mem_id = v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin')
      AND r.vers = 0
      AND r.del_yn = false
  );
$$;
