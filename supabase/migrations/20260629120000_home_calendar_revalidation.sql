-- 홈 캘린더 관련 테이블 변경 시 revalidation 트리거
-- 기존 revalidate_records() 함수를 재활용 (같은 /api/revalidate 엔드포인트 호출)

-- comp_mst (대회 생성/수정/삭제)
DROP TRIGGER IF EXISTS trg_comp_mst_revalidate ON public.comp_mst;
CREATE TRIGGER trg_comp_mst_revalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.comp_mst
  FOR EACH ROW EXECUTE FUNCTION revalidate_records();

-- team_comp_plan_rel (팀 대회 연결 변경)
DROP TRIGGER IF EXISTS trg_team_comp_plan_rel_revalidate ON public.team_comp_plan_rel;
CREATE TRIGGER trg_team_comp_plan_rel_revalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.team_comp_plan_rel
  FOR EACH ROW EXECUTE FUNCTION revalidate_records();

-- sch_post_mst (일정 게시글 변경)
DROP TRIGGER IF EXISTS trg_sch_post_mst_revalidate ON public.sch_post_mst;
CREATE TRIGGER trg_sch_post_mst_revalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.sch_post_mst
  FOR EACH ROW EXECUTE FUNCTION revalidate_records();

-- gthr_mst (모임 변경)
DROP TRIGGER IF EXISTS trg_gthr_mst_revalidate ON public.gthr_mst;
CREATE TRIGGER trg_gthr_mst_revalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.gthr_mst
  FOR EACH ROW EXECUTE FUNCTION revalidate_records();
