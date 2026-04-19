-- 팀원이 대회 참가(또는 기록 저장으로 comp_reg 유지) 시점에만 team_comp_plan_rel을 만들 수 있게
-- INSERT 허용 정책 추가. 참가 행이 없는 플랜 행은 제거한다.

-- 기존: owner/admin만 team_comp_plan_rel FOR ALL (INSERT 포함)
-- 추가: 소속 팀원은 (team_id, comp_id, vers=0, del_yn=false) 행만 INSERT 가능
DROP POLICY IF EXISTS team_comp_plan_rel_insert_teammate ON public.team_comp_plan_rel;

CREATE POLICY team_comp_plan_rel_insert_teammate
  ON public.team_comp_plan_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    vers = 0
    AND del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_comp_plan_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

COMMENT ON POLICY team_comp_plan_rel_insert_teammate ON public.team_comp_plan_rel IS
  '팀 소속 멤버가 대회 참가·기록 연동 시 team_comp_plan_rel을 최초 1회 생성할 수 있다.';

-- 참가 행(comp_reg_rel)이 한 건도 없는 플랜만 제거한다.
-- (소프트 삭제된 참가만 남은 경우 FK 때문에 행이 남을 수 있음 — 별도 정리 필요 시 후속 마이그)
DELETE FROM public.team_comp_plan_rel tcp
WHERE tcp.vers = 0
  AND tcp.del_yn = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.comp_reg_rel cr
    WHERE cr.team_comp_id = tcp.team_comp_id
  );
