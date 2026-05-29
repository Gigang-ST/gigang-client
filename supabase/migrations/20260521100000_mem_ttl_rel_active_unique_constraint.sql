-- mem_ttl_rel: 활성 칭호(vers=0, del_yn=false) 중복 부여 방지 partial unique constraint
-- engine.ts의 TOCTOU 경쟁 조건을 DB 레벨에서 차단한다
CREATE UNIQUE INDEX IF NOT EXISTS uk_mem_ttl_rel_team_mem_ttl_active
  ON public.mem_ttl_rel (team_mem_id, ttl_id)
  WHERE vers = 0 AND del_yn = false;
