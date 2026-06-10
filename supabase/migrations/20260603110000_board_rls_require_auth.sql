-- brd_post_mst SELECT 정책: 비로그인 접근 차단, 로그인 유저만 조회 가능
DROP POLICY IF EXISTS brd_post_mst_select ON brd_post_mst;

CREATE POLICY brd_post_mst_select ON brd_post_mst
  FOR SELECT USING (
    del_yn = false
    AND auth.uid() IS NOT NULL
  );
