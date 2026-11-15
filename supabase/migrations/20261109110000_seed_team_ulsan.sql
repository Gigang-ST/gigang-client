-- 울산지부 팀 행 시드.
--
-- 팀 UUID는 코드 상수(`lib/constants/gigang-team.ts`의 TEAM_ID_BY_CD)로 해석하므로
-- dev/prd에 **같은 값**으로 넣어야 한다(기강 c0ffee00-…-0001과 같은 규칙).
-- 이름(team_nm)은 임시 — 정식 명칭이 정해지면 UPDATE 한다. 주소(ulsan.gigang.team)는
-- 이 행이 아니라 코드의 주소 표에 있으므로 주소가 바뀌어도 이 행은 그대로다.
SET lock_timeout = '3s';

INSERT INTO public.team_mst (team_id, team_cd, team_nm)
SELECT 'c0ffee00-0000-4000-8000-000000000002'::uuid, 'ulsan', '울산지부'
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_mst
  WHERE team_id = 'c0ffee00-0000-4000-8000-000000000002'::uuid OR team_cd = 'ulsan'
);
