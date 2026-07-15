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

  select coalesce(max(vers), 0) + 1 into v_next_vers
  from public.team_mem_rel
  where team_id = v_cur.team_id and mem_id = v_cur.mem_id;

  -- 정본을 이력(vers>0)으로 밀고 삭제 마킹. PK 유지 → 칭호 FK 안전. vers=0 슬롯이 빔.
  update public.team_mem_rel
    set vers = v_next_vers, del_yn = true, eff_at = p_eff_at, upd_at = now()
  where team_mem_id = p_team_mem_id and vers = 0;
end;
$$;

comment on function public.apply_team_mem_rel_delete(uuid, timestamptz) is
  '회원 소속 삭제 = 정본(vers=0)을 vers=max+1·del_yn=true 이력으로 밀어 vers=0 슬롯을 비운다. 재가입 시 새 정본 INSERT 가능. team_mem_id(PK) 유지로 칭호 FK 보존.';

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
