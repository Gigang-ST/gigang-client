-- 게시판 글 읽기를 "로그인"이 아니라 "그 팀 회원"으로 한정한다.
--
-- 기존(20260603110000)은 auth.uid() IS NOT NULL 만 확인해, 가입만 한 비회원도 글을 읽을 수 있었다.
-- 팀 소속 확인은 cmnt_mst_select 와 같은 v2_rls_auth_in_team(team_id) 를 쓴다.
--
-- 앱 영향 없음: 게시판 목록·상세·API(app/api/board)·사이트맵은 모두 service_role(createUntypedAdminClient)로
-- 읽어 RLS 를 거치지 않는다(비로그인 공개 열람은 서버가 책임진다). 이 정책은 PostgREST 직접 호출에만 적용된다.
SET lock_timeout = '3s';

DROP POLICY IF EXISTS brd_post_mst_select ON public.brd_post_mst;

CREATE POLICY brd_post_mst_select ON public.brd_post_mst
  FOR SELECT TO authenticated
  USING (
    del_yn = false
    AND public.v2_rls_auth_in_team(team_id)
  );
