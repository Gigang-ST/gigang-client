-- rec_race_hist INSERT/UPDATE WITH CHECK: 서브쿼리 내 bare mem_id 가 mem_mst 별칭 m 에 붙어 m.mem_id = m.mem_id 로 풀릴 수 있음
-- 삽입·갱신 행의 회원 PK는 rec_race_hist.mem_id 로 명시한다.

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
