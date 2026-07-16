-- 회원 상태 이력(vers) — 원자적 이력화 RPC (조각 2/7)
-- 설계: docs/superpowers/specs/2026-07-15-회원상태이력-비활성회비제외-design.md §4.3
--
-- 상태/역할 변경 시: ① 현재 정본(vers=0)을 FOR UPDATE 락 → ② 변경 전 스냅샷을
-- (새 PK, vers=max+1) 이력으로 보존 → ③ 정본(vers=0)을 p_changes 로 UPDATE + eff_at 갱신.
-- 정본의 team_mem_id(PK)는 불변 → 이를 참조하는 유일한 FK(mem_ttl_rel, 칭호)가 안전.
-- Supabase JS 는 여러 문장을 한 트랜잭션으로 못 묶으므로 DB 함수로 원자화(recalc_member_balance 선례).

create or replace function public.apply_team_mem_rel_change(
  p_team_mem_id uuid,
  p_changes jsonb,
  p_eff_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur public.team_mem_rel%rowtype;
  v_next_vers int;
begin
  -- ① 현재 정본 락 (동시 상태 변경 시 vers 순번 경합 방지)
  select * into v_cur
  from public.team_mem_rel
  where team_mem_id = p_team_mem_id and vers = 0
  for update;

  if not found then
    raise exception '정본(vers=0) team_mem_rel 없음: %', p_team_mem_id;
  end if;

  -- ①-b 권한 검증(심층 방어) — 이 함수는 service_role 에게만 GRANT 되지만(아래 REVOKE/GRANT),
  --    SECURITY DEFINER 라 향후 누가 GRANT 를 넓혀도 남의 팀을 못 건드리게 내부에서 재확인한다.
  --    end-user 세션(auth.uid() 있음)이면 대상 팀 owner/admin 이어야 하고, 서버 경로
  --    (service_role → auth.uid()=null)는 통과시킨다.
  if (select auth.uid()) is not null
     and not public.v2_rls_auth_team_owner_or_admin(v_cur.team_id) then
    raise exception '권한 없음: team_mem_rel 변경은 대상 팀 관리자만 가능';
  end if;

  -- ② 변경 전 정본을 이력으로 복사 (새 PK, vers=max+1). eff_at 은 그대로 유지
  --    → 그 상태가 "효력을 발생했던 시각"을 보존해야 타임라인이 이어진다.
  select coalesce(max(vers), 0) + 1 into v_next_vers
  from public.team_mem_rel
  where team_id = v_cur.team_id and mem_id = v_cur.mem_id;

  insert into public.team_mem_rel (
    team_mem_id, team_id, mem_id, team_role_cd, mem_st_cd, join_dt, leave_dt,
    vers, del_yn, crt_at, upd_at, selected_badge_effect, selected_frame_cd,
    inact_rsn_txt, card_featured, eff_at
  ) values (
    gen_random_uuid(), v_cur.team_id, v_cur.mem_id, v_cur.team_role_cd, v_cur.mem_st_cd,
    v_cur.join_dt, v_cur.leave_dt, v_next_vers, v_cur.del_yn, v_cur.crt_at, now(),
    v_cur.selected_badge_effect, v_cur.selected_frame_cd, v_cur.inact_rsn_txt,
    v_cur.card_featured, v_cur.eff_at
  );

  -- ③ 정본(vers=0)을 새 상태로 갱신. p_changes 에 있는 키만 반영(없으면 유지),
  --    inact_rsn_txt 는 null 세팅(재활성)도 지원해야 하므로 키 존재(?)로 판정.
  update public.team_mem_rel set
    mem_st_cd     = coalesce(p_changes->>'mem_st_cd', mem_st_cd),
    team_role_cd  = coalesce(p_changes->>'team_role_cd', team_role_cd),
    inact_rsn_txt = case when p_changes ? 'inact_rsn_txt' then p_changes->>'inact_rsn_txt' else inact_rsn_txt end,
    del_yn        = coalesce((p_changes->>'del_yn')::boolean, del_yn),
    join_dt       = case when p_changes ? 'join_dt'  then (p_changes->>'join_dt')::date  else join_dt  end,
    leave_dt      = case when p_changes ? 'leave_dt' then (p_changes->>'leave_dt')::date else leave_dt end,
    eff_at        = p_eff_at,
    upd_at        = now()
  where team_mem_id = p_team_mem_id and vers = 0;
end;
$$;

comment on function public.apply_team_mem_rel_change(uuid, jsonb, timestamptz) is
  '회원 소속 상태/역할 변경을 원자적으로 이력화. 변경 전 정본을 vers=max+1 이력으로 보존하고 정본(vers=0)을 p_changes 로 갱신. 정본 PK 불변(칭호 FK 안전). 삭제(vers 밀기)는 별도 RPC(조각3).';

-- 앱의 모든 호출 경로가 service_role(createAdminClient)이므로 service_role 만 허용한다.
-- (온보딩 자기 가입은 이 RPC 를 쓰지 않고 team_mem_rel 직접 INSERT — GRANT 불필요.)
-- PUBLIC 뿐 아니라 authenticated·anon 의 EXECUTE 도 명시 회수해야 한다 — `from public` 만으로는
-- authenticated 에 준 명시적 GRANT 가 안 지워지고, SECURITY DEFINER + auth.uid()=null 우회로
-- anon 이 /rpc/ 로 남의 회원을 조작하는 IDOR 가 열린다.
revoke all on function public.apply_team_mem_rel_change(uuid, jsonb, timestamptz) from public, authenticated, anon;
grant execute on function public.apply_team_mem_rel_change(uuid, jsonb, timestamptz) to service_role;
