-- 비로그인(anon) 사용자도 모임 목록/상세 조회 가능하도록 RLS 정책 추가
-- sch_post_mst_select_anon 과 동일한 패턴 (20260616030000_sch_post_mst_anon_select.sql 참조)
-- team_id 조건으로 타 팀 모임 직접 접근 차단

CREATE POLICY gthr_mst_select_anon
  ON gthr_mst
  FOR SELECT
  TO anon
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1 FROM public.team_mst t WHERE t.team_id = gthr_mst.team_id
    )
  );

CREATE POLICY gthr_attd_rel_select_anon
  ON gthr_attd_rel
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM gthr_mst g
      WHERE g.gthr_id = gthr_attd_rel.gthr_id
        AND g.del_yn = false
    )
  );
