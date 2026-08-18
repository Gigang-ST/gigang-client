-- batch_job_mst.team_id — 배치가 어느 팀 것인지를 **데이터에** 둔다.
--
-- 배경(설계 docs/design/2026-08-14-배치-자동화.md §3.1):
--   `batchDuesExemption`은 팀을 `getRequestTeamContext()`(Host 헤더)로 해석했다. 관리자가
--   브라우저에서 누를 땐 맞지만, **Vercel Cron이 부르는 요청은 `x-forwarded-host`가
--   `*.vercel.app`일 수 있고** 그러면 `extractTeamCdFromHost`가 `vercel`을 팀코드로 읽어
--   `DEFAULT_FALLBACK_TEAM_ID`로 조용히 떨어진다. 팀이 하나뿐인 지금은 우연히 맞지만,
--   **회비 감면을 "우연히 맞는 것"에 걸어 둘 수는 없다.**
--
--   그래서 크론은 Host를 보지 않고 이 컬럼을 읽는다. 멀티팀이 되면 job을 팀별로 등록하면 되고
--   코드는 그대로다.

ALTER TABLE public.batch_job_mst
  ADD COLUMN team_id UUID REFERENCES public.team_mst(team_id);

-- 기존 2건은 기강 팀 것이다. 생성된 UUID를 하드코딩하지 않고 team_cd로 찾는다.
UPDATE public.batch_job_mst
   SET team_id = (SELECT team_id FROM public.team_mst WHERE team_cd = 'gigang' AND del_yn = false LIMIT 1),
       upd_at  = now()
 WHERE team_id IS NULL;

COMMENT ON COLUMN public.batch_job_mst.team_id IS
  '이 배치가 대상으로 하는 팀. 크론은 Host가 아니라 이 값으로 팀을 정한다(설계 §3.1).';
