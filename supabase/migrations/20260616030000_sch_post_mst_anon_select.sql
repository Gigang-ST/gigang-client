-- sch_post_mst: 비로그인(anon)도 조회 가능하도록 SELECT 정책 추가
-- 대회접수/세일/이벤트 등 공개 정보는 비로그인도 볼 수 있어야 함
-- 댓글(cmnt_mst), 대회 참가(comp_reg_rel)는 기존대로 authenticated only 유지

CREATE POLICY sch_post_mst_select_anon ON public.sch_post_mst
  FOR SELECT TO anon
  USING (del_yn = false);
