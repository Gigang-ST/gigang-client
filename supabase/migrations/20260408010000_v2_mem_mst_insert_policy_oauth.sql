-- mem_mst INSERT 정책 보강:
-- 신규 가입 시 mem_id는 독립 식별자로 생성하고, auth.uid()는 OAuth 컬럼으로만 매핑한다.

DROP POLICY IF EXISTS mem_mst_insert_own ON public.mem_mst;

CREATE POLICY mem_mst_insert_own
  ON public.mem_mst
  FOR INSERT
  TO authenticated
  WITH CHECK (
    oauth_kakao_id = auth.uid()
    OR oauth_google_id = auth.uid()
  );

COMMENT ON POLICY mem_mst_insert_own ON public.mem_mst IS
  '신규 가입 INSERT: OAuth ID(auth.uid()) 매칭만 허용';
