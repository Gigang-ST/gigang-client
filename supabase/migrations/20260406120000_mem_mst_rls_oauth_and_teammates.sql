-- 슬라이스 1 앱 전환: mem_mst 조회·수정이 레거시 OAuth 연동(mem_id != auth.uid())과 호환되도록 RLS 보강.
-- 팀원 간 프로필 조회는 기존 public.member(비RLS) 수준에 맞춤.
-- 기준: database-schema-v2-member-domain.md §5, database-schema-v2-app-migration-plan.md 슬라이스 1

DROP POLICY IF EXISTS mem_mst_select_own ON public.mem_mst;

CREATE POLICY mem_mst_select_own
  ON public.mem_mst
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND (
      mem_id = auth.uid()
      OR oauth_kakao_id = auth.uid()
      OR oauth_google_id = auth.uid()
    )
  );

-- 같은 팀(정본) 소속끼리 mem_mst 조회 — 관리자 목록·홈 등 기존 member 전체 조회와 동등
DROP POLICY IF EXISTS mem_mst_select_same_team ON public.mem_mst;

CREATE POLICY mem_mst_select_same_team
  ON public.mem_mst
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r_self
      INNER JOIN public.team_mem_rel r_peer
        ON r_self.team_id = r_peer.team_id
       AND r_peer.mem_id = mem_mst.mem_id
      WHERE r_self.mem_id = auth.uid()
        AND r_self.vers = 0
        AND r_self.del_yn = false
        AND r_peer.vers = 0
        AND r_peer.del_yn = false
    )
  );

DROP POLICY IF EXISTS mem_mst_update_own ON public.mem_mst;

CREATE POLICY mem_mst_update_own
  ON public.mem_mst
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND (
      mem_id = auth.uid()
      OR oauth_kakao_id = auth.uid()
      OR oauth_google_id = auth.uid()
    )
  )
  WITH CHECK (
    del_yn = false
    AND (
      mem_id = auth.uid()
      OR oauth_kakao_id = auth.uid()
      OR oauth_google_id = auth.uid()
    )
  );

COMMENT ON POLICY mem_mst_select_own ON public.mem_mst IS
  '본인 행: mem_id 또는 OAuth ID가 auth.uid()와 일치';
COMMENT ON POLICY mem_mst_select_same_team ON public.mem_mst IS
  '동일 팀(vers=0) 소속 간 프로필 조회';
COMMENT ON POLICY mem_mst_update_own ON public.mem_mst IS
  '본인 행 수정: mem_id 또는 OAuth ID 매칭';
