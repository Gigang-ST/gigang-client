-- fix: mem_mst_insert_own RLS 정책에 mem_id = auth.uid() 조건 복원
-- 배경: 원본(wave2)에는 mem_id = auth.uid()만 있었으나 remote에서 수동 변경되어
--       oauth_kakao_id/oauth_google_id만 체크하도록 바뀜 → email provider 가입 불가
-- 해결: mem_id OR oauth_kakao_id OR oauth_google_id 모두 허용

DROP POLICY IF EXISTS mem_mst_insert_own ON public.mem_mst;

CREATE POLICY mem_mst_insert_own
  ON public.mem_mst
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (mem_id = auth.uid())
    OR (oauth_kakao_id = auth.uid())
    OR (oauth_google_id = auth.uid())
  );
