-- rec_race_hist RLS: mem_id = auth.uid() 만 허용하면 oauth_* 로 연동된 레거시 회원(mem_id ≠ auth.uid())이 기록 저장 불가
-- 앱의 fetchMemMstWithTeamRel 과 동일하게 mem_mst 정본이 현재 세션 사용자와 연결된 경우만 본인 행으로 본다.

DROP POLICY IF EXISTS rec_race_hist_insert_own ON public.rec_race_hist;
CREATE POLICY rec_race_hist_insert_own
  ON public.rec_race_hist
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.mem_mst m
      WHERE m.mem_id = rec_race_hist.mem_id
        AND m.vers = 0
        AND m.del_yn = false
        AND (
          m.mem_id = auth.uid()
          OR m.oauth_kakao_id = auth.uid()
          OR m.oauth_google_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS rec_race_hist_update_own ON public.rec_race_hist;
CREATE POLICY rec_race_hist_update_own
  ON public.rec_race_hist
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.mem_mst m
      WHERE m.mem_id = rec_race_hist.mem_id
        AND m.vers = 0
        AND m.del_yn = false
        AND (
          m.mem_id = auth.uid()
          OR m.oauth_kakao_id = auth.uid()
          OR m.oauth_google_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.mem_mst m
      WHERE m.mem_id = rec_race_hist.mem_id
        AND m.vers = 0
        AND m.del_yn = false
        AND (
          m.mem_id = auth.uid()
          OR m.oauth_kakao_id = auth.uid()
          OR m.oauth_google_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS rec_race_hist_delete_own ON public.rec_race_hist;
CREATE POLICY rec_race_hist_delete_own
  ON public.rec_race_hist
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mem_mst m
      WHERE m.mem_id = rec_race_hist.mem_id
        AND m.vers = 0
        AND m.del_yn = false
        AND (
          m.mem_id = auth.uid()
          OR m.oauth_kakao_id = auth.uid()
          OR m.oauth_google_id = auth.uid()
        )
    )
  );
