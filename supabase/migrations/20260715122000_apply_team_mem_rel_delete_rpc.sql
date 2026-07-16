-- 회원 상태 이력(vers) — 삭제 = vers 밀기 RPC + 기존 삭제분 백필 (조각 3/7)
-- 설계: docs/superpowers/specs/2026-07-15-회원상태이력-비활성회비제외-design.md §4.4
--
-- 삭제는 정본을 남기지 않고 vers>0 이력으로 "밀어" (team_id, mem_id, vers=0) 슬롯을 비운다.
-- → 유니크 UNIQUE(team_id, mem_id, vers) 충돌 없이 재가입(새 vers=0 INSERT) 가능.
-- team_mem_id(PK)는 유지 → 칭호 FK 무결성 보존(삭제 회원의 과거 칭호는 이력에 그대로 붙어 있음).

create or replace function public.apply_team_mem_rel_delete(
  p_team_mem_id uuid,
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
  select * into v_cur
  from public.team_mem_rel
  where team_mem_id = p_team_mem_id and vers = 0
  for update;

  if not found then
    raise exception '정본(vers=0) team_mem_rel 없음: %', p_team_mem_id;
  end if;

  -- 권한 검증(심층 방어) — service_role 전용이지만 SECURITY DEFINER 라 내부에서 재확인.
  if (select auth.uid()) is not null
     and not public.v2_rls_auth_team_owner_or_admin(v_cur.team_id) then
    raise exception '권한 없음: team_mem_rel 삭제는 대상 팀 관리자만 가능';
  end if;

  select coalesce(max(vers), 0) + 1 into v_next_vers
  from public.team_mem_rel
  where team_id = v_cur.team_id and mem_id = v_cur.mem_id;

  -- ① 삭제 직전 상태를 이력(vers=max+1)으로 보존 — eff_at 은 그대로 유지.
  --    그래야 "마지막 상태 전환~삭제" 사이의 active 구간이 타임라인에 남아, 재가입 후
  --    리플레이 시 그 기간 회비가 누락되지 않는다. (change RPC 와 같은 복사-후-갱신 패턴)
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

  -- ② 정본(vers=0)을 삭제 경계 이력(vers=max+2)으로 밀고 삭제 마킹. eff_at=삭제 시각.
  --    PK 유지 → 칭호 FK 안전. vers=0 슬롯이 비어 재가입(새 정본 INSERT) 가능.
  update public.team_mem_rel
    set vers = v_next_vers + 1, del_yn = true, eff_at = p_eff_at, upd_at = now()
  where team_mem_id = p_team_mem_id and vers = 0;
end;
$$;

comment on function public.apply_team_mem_rel_delete(uuid, timestamptz) is
  '회원 소속 삭제 = 정본(vers=0)을 vers=max+1·del_yn=true 이력으로 밀어 vers=0 슬롯을 비운다. 재가입 시 새 정본 INSERT 가능. team_mem_id(PK) 유지로 칭호 FK 보존.';

-- PUBLIC·authenticated·anon EXECUTE 모두 회수 후 service_role 만 허용(관리자 삭제 액션 전용).
-- (`from public` 만으로는 authenticated 명시 GRANT·anon 이 남아 IDOR 가 열린다 — change RPC 주석 참조)
revoke all on function public.apply_team_mem_rel_delete(uuid, timestamptz) from public, authenticated, anon;
grant execute on function public.apply_team_mem_rel_delete(uuid, timestamptz) to service_role;

-- 기존 삭제분(del_yn=true, vers=0) 백필: 슬롯을 비워 재가입 가능하게. 대상 없으면 no-op(멱등).
update public.team_mem_rel r
  set vers = sub.next_vers
from (
  select t.team_mem_id,
         (select coalesce(max(x.vers), 0) + 1 from public.team_mem_rel x
           where x.team_id = t.team_id and x.mem_id = t.mem_id) as next_vers
  from public.team_mem_rel t
  where t.del_yn = true and t.vers = 0
) sub
where r.team_mem_id = sub.team_mem_id;
