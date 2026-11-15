-- 멀티팀 — 건의(fdbk_mst)를 팀별로.
--
-- 건의는 "그 팀 운영진에게 하는 말"인데 팀 칸이 없어, 울산 관리자 화면에 기강 회원의 건의(내용·이름)가
-- 그대로 보이고 상태를 바꾸거나 답변까지 달 수 있었다(답변 알림은 울산 이름으로 기강 회원에게 갔다).
-- 다른 팀 데이터 대부분은 팀 칸이 있거나 부모 행(모임·프로젝트)이 팀을 정하는데, 건의만 둘 다 없었다.
--
-- 기존 행(prd 5건)은 전부 기강 회원이 기강에 낸 것이라 기강으로 채운다.
--
-- ⚠️ 기본값을 기강으로 둔다 — **전환용.** 배포 전 옛 코드는 팀 없이 INSERT 하므로, 기본값 없이 NOT NULL 을
-- 걸면 배포 전까지 건의 제출이 실패한다. 새 코드는 늘 팀을 넣으므로 배포가 끝나면 기본값을 지운다(runbook).
SET lock_timeout = '3s';

ALTER TABLE public.fdbk_mst
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.team_mst(team_id);

UPDATE public.fdbk_mst f
SET team_id = t.team_id
FROM public.team_mst t
WHERE t.team_cd = 'gigang' AND f.team_id IS NULL;

ALTER TABLE public.fdbk_mst
  ALTER COLUMN team_id SET DEFAULT 'c0ffee00-0000-4000-8000-000000000001'::uuid,
  ALTER COLUMN team_id SET NOT NULL;

COMMENT ON COLUMN public.fdbk_mst.team_id IS
  '건의를 낸 팀(접속한 팀). 그 팀 관리자만 보고 처리한다. 기본값(기강)은 배포 전 옛 코드용 — 배포 후 제거.';

-- 팀별 조회 인덱스는 별도 파일 20261109210500_fdbk_team_index.sql(CONCURRENTLY — 다른 DDL 과 섞지 않는다, README)

-- 본인 INSERT 정책: 내가 속한 팀으로만 낼 수 있게(지금 앱은 서버가 넣지만, 정책도 같은 경계로)
DROP POLICY IF EXISTS fdbk_mst_insert_self ON public.fdbk_mst;
CREATE POLICY fdbk_mst_insert_self ON public.fdbk_mst
  FOR INSERT
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id() AND public.v2_rls_auth_in_team(team_id));

-- 팀 칸은 한 번 정해지면 못 바꾼다(다른 팀으로 옮기기 금지 — 20261109150000 과 같은 트리거)
DROP TRIGGER IF EXISTS forbid_team_id_change ON public.fdbk_mst;
CREATE TRIGGER forbid_team_id_change
  BEFORE UPDATE OF team_id ON public.fdbk_mst
  FOR EACH ROW EXECUTE FUNCTION public.forbid_team_col_change('team_id');
