-- 개인 일정 인덱스 — 조회는 늘 "내 것 · 이 팀 · 날짜 범위"다(달력 그리드·리스트 무한스크롤)
SET lock_timeout = '3s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_mem_sch_mst_mem_team_dt
  ON public.mem_sch_mst (mem_id, team_id, sch_dt)
  WHERE del_yn = false;
