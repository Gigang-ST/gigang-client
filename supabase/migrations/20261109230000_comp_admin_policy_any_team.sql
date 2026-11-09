-- 대회 원본(comp_mst)·종목(comp_evt_cfg) 관리자 쓰기 정책 — 기강 팀 id 고정을 걷어낸다.
--
-- 대회 원본은 모든 팀 공용이고, 정한 규칙은 "아무 팀 관리자나 고칠 수 있다"(PR #649).
-- 그런데 이 두 정책은 v2 전환 때(20260406230000) 팀이 기강 하나뿐이라 기강 id 를 박아 두어,
-- 울산 관리자는 해당이 안 됐다.
--
-- 앱의 대회 등록·수정·삭제는 서버에서 service_role 로 처리해(RLS 우회) 화면 동작은 바뀌지 않는다.
-- 정책이 걸리는 건 앱을 거치지 않는 직접 요청뿐이라, 정책을 규칙에 맞추는 정리다.

ALTER POLICY comp_mst_mutate_team_admin ON public.comp_mst
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd = ANY (ARRAY['owner'::text, 'admin'::text])
      AND r.vers = 0
      AND r.del_yn = false
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd = ANY (ARRAY['owner'::text, 'admin'::text])
      AND r.vers = 0
      AND r.del_yn = false
  ));

ALTER POLICY comp_evt_cfg_mutate_team_admin ON public.comp_evt_cfg
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd = ANY (ARRAY['owner'::text, 'admin'::text])
      AND r.vers = 0
      AND r.del_yn = false
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd = ANY (ARRAY['owner'::text, 'admin'::text])
      AND r.vers = 0
      AND r.del_yn = false
  ));
