-- 멀티팀 RLS 정리 — 브라우저(로그인 세션)·API 직접 호출로 다른 팀 데이터를 보거나 옮기지 못하게.
--
-- 서버 액션 쪽 팀 확인은 앱 코드에서 했다(lib/actions/team-scope.ts). 이건 그 바깥 —
-- 공개 키 + 로그인 토큰만으로 PostgREST 를 직접 부르는 경로다.
--
-- 1) 본인 소속 행은 언제나 읽힌다(team_mem_rel_select_own) — 아래 2)에서 탈퇴자를 팀 판정에서 빼므로,
--    이게 없으면 탈퇴자가 자기 소속 행을 못 읽어 getCurrentMember 가 "미가입자"로 보고 온보딩으로 보낸다.
-- 2) 팀 판정 함수: 탈퇴자(left)는 팀 회원이 아니다. 관리자 판정은 활동 중(active)일 때만(앱 withAdmin 과 같은 기준).
--    회비 테이블 정책은 이 함수를 안 쓰고 조건을 직접 적어 둬서 영향이 없다.
-- 3) 마일리지런 5개 테이블: 로그인만 하면 전부 읽히던 것(true)을 그 팀 회원만.
-- 4) 팀 칸 고정: 작성자가 자기 글·모임의 team_id 를(대회 신청은 team_comp_id 를) 다른 팀으로 옮기지 못하게.
--    정책 조건으로는 "두 팀 소속자가 자기 다른 팀으로 옮기는 것"을 못 막아 칸 자체를 고정한다. 앱은 이 칸을 바꾸지 않는다.
-- 5) 배치: 아무 팀 관리자나 모든 팀 배치를 고치던 것을 자기 팀 것만.
-- 6) 대회 신청 정책을 팀 판정 함수로 통일(탈퇴자·비활성 관리자 기준이 같이 따라오게).
-- 7) 미납 인원 함수는 서버(service_role)만 — 비로그인도 아무 팀 미납 인원을 볼 수 있었다.
SET lock_timeout = '3s';

-- 1) 본인 소속 행
DROP POLICY IF EXISTS team_mem_rel_select_own ON public.team_mem_rel;
CREATE POLICY team_mem_rel_select_own ON public.team_mem_rel
  FOR SELECT TO authenticated
  USING ((del_yn = false) AND (mem_id = v2_rls_resolve_mem_id()));

-- 2) 팀 판정 함수 (속성은 기존과 같다: STABLE SECURITY DEFINER, row_security off)
CREATE OR REPLACE FUNCTION public.v2_rls_auth_in_team(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = p_team_id
      AND r.mem_id = v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false
      AND r.mem_st_cd <> 'left'
  );
$function$;

CREATE OR REPLACE FUNCTION public.v2_rls_auth_shares_team_with_mem(p_peer_mem_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_mem_rel r_self
    INNER JOIN public.team_mem_rel r_peer
      ON r_self.team_id = r_peer.team_id AND r_peer.mem_id = p_peer_mem_id
    WHERE r_self.mem_id = v2_rls_resolve_mem_id()
      AND r_self.vers = 0 AND r_self.del_yn = false
      AND r_self.mem_st_cd <> 'left'
      AND r_peer.vers = 0 AND r_peer.del_yn = false
  );
$function$;

CREATE OR REPLACE FUNCTION public.v2_rls_auth_team_owner_or_admin(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = p_team_id
      AND r.mem_id = v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin')
      AND r.mem_st_cd = 'active'
      AND r.vers = 0 AND r.del_yn = false
  );
$function$;

-- 3) 마일리지런 — 그 팀 회원만
DROP POLICY IF EXISTS evt_team_mst_select ON public.evt_team_mst;
CREATE POLICY evt_team_mst_select ON public.evt_team_mst
  FOR SELECT TO authenticated
  USING (v2_rls_auth_in_team(team_id));

DROP POLICY IF EXISTS evt_team_prt_rel_select ON public.evt_team_prt_rel;
CREATE POLICY evt_team_prt_rel_select ON public.evt_team_prt_rel
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evt_team_mst e
                 WHERE e.evt_id = evt_team_prt_rel.evt_id AND v2_rls_auth_in_team(e.team_id)));

DROP POLICY IF EXISTS evt_mlg_mult_cfg_select ON public.evt_mlg_mult_cfg;
CREATE POLICY evt_mlg_mult_cfg_select ON public.evt_mlg_mult_cfg
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evt_team_mst e
                 WHERE e.evt_id = evt_mlg_mult_cfg.evt_id AND v2_rls_auth_in_team(e.team_id)));

DROP POLICY IF EXISTS evt_mlg_act_hist_select ON public.evt_mlg_act_hist;
CREATE POLICY evt_mlg_act_hist_select ON public.evt_mlg_act_hist
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evt_team_prt_rel p
                 JOIN public.evt_team_mst e ON e.evt_id = p.evt_id
                 WHERE p.prt_id = evt_mlg_act_hist.prt_id AND v2_rls_auth_in_team(e.team_id)));

DROP POLICY IF EXISTS evt_mlg_mth_snap_select ON public.evt_mlg_mth_snap;
CREATE POLICY evt_mlg_mth_snap_select ON public.evt_mlg_mth_snap
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evt_team_prt_rel p
                 JOIN public.evt_team_mst e ON e.evt_id = p.evt_id
                 WHERE p.prt_id = evt_mlg_mth_snap.prt_id AND v2_rls_auth_in_team(e.team_id)));

-- 4) 팀 칸 고정
CREATE OR REPLACE FUNCTION public.forbid_team_col_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_col text := TG_ARGV[0];
BEGIN
  IF (to_jsonb(NEW) -> v_col) IS DISTINCT FROM (to_jsonb(OLD) -> v_col) THEN
    RAISE EXCEPTION '%.% 은(는) 바꿀 수 없습니다 — 다른 팀으로 옮길 수 없어요', TG_TABLE_NAME, v_col
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gthr_mst','sch_post_mst','brd_post_mst','cmnt_mst','post_mst','msg_mst','pldg_mst','rctn_mst','mem_sch_mst']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS forbid_team_id_change ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER forbid_team_id_change BEFORE UPDATE OF team_id ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.forbid_team_col_change(%L)', t, 'team_id');
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS forbid_team_comp_id_change ON public.comp_reg_rel;
CREATE TRIGGER forbid_team_comp_id_change
  BEFORE UPDATE OF team_comp_id ON public.comp_reg_rel
  FOR EACH ROW EXECUTE FUNCTION public.forbid_team_col_change('team_comp_id');

-- 5) 배치 — 자기 팀 것만
DROP POLICY IF EXISTS batch_job_mst_admin_all ON public.batch_job_mst;
CREATE POLICY batch_job_mst_admin_all ON public.batch_job_mst
  FOR ALL TO authenticated
  USING (v2_rls_auth_team_owner_or_admin(team_id))
  WITH CHECK (v2_rls_auth_team_owner_or_admin(team_id));

DROP POLICY IF EXISTS batch_run_hist_admin_all ON public.batch_run_hist;
CREATE POLICY batch_run_hist_admin_all ON public.batch_run_hist
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_job_mst j
                 WHERE j.job_id = batch_run_hist.job_id AND v2_rls_auth_team_owner_or_admin(j.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.batch_job_mst j
                      WHERE j.job_id = batch_run_hist.job_id AND v2_rls_auth_team_owner_or_admin(j.team_id)));

-- 6) 대회 신청 — 팀 판정 함수로 통일
DROP POLICY IF EXISTS comp_reg_rel_select_teammate ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_select_teammate ON public.comp_reg_rel
  FOR SELECT TO authenticated
  USING ((del_yn = false) AND EXISTS (
    SELECT 1 FROM public.team_comp_plan_rel tcp
    WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
      AND v2_rls_auth_in_team(tcp.team_id)));

DROP POLICY IF EXISTS comp_reg_rel_insert_self_member ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_insert_self_member ON public.comp_reg_rel
  FOR INSERT TO authenticated
  WITH CHECK ((mem_id = v2_rls_resolve_mem_id()) AND EXISTS (
    SELECT 1 FROM public.team_comp_plan_rel tcp
    WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
      AND v2_rls_auth_in_team(tcp.team_id)));

DROP POLICY IF EXISTS comp_reg_rel_update_self_or_team_admin ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_update_self_or_team_admin ON public.comp_reg_rel
  FOR UPDATE TO authenticated
  USING ((del_yn = false) AND ((mem_id = v2_rls_resolve_mem_id()) OR EXISTS (
    SELECT 1 FROM public.team_comp_plan_rel tcp
    WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
      AND v2_rls_auth_team_owner_or_admin(tcp.team_id))))
  WITH CHECK ((mem_id = v2_rls_resolve_mem_id()) OR EXISTS (
    SELECT 1 FROM public.team_comp_plan_rel tcp
    WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
      AND v2_rls_auth_team_owner_or_admin(tcp.team_id)));

DROP POLICY IF EXISTS comp_reg_rel_delete_self_or_team_admin ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_delete_self_or_team_admin ON public.comp_reg_rel
  FOR DELETE TO authenticated
  USING ((mem_id = v2_rls_resolve_mem_id()) OR EXISTS (
    SELECT 1 FROM public.team_comp_plan_rel tcp
    WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
      AND v2_rls_auth_team_owner_or_admin(tcp.team_id)));

-- 7) 미납 인원 — 서버만
REVOKE ALL ON FUNCTION public.get_admin_unpaid_active_count(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_unpaid_active_count(uuid) TO service_role;
