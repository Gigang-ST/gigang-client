-- 보안 핫픽스 — apply_team_mem_rel_change/delete 의 authenticated·anon EXECUTE 회수
-- 설계: docs/superpowers/specs/2026-07-15-회원상태이력-비활성회비제외-design.md §4.3
--
-- 문제: 최초 두 RPC 마이그레이션이 `grant to authenticated` 로 명시 권한을 줬고, 이후 강화가
--   `revoke all from public` 만 해서 authenticated 명시 GRANT + 기본 anon 이 남았다. 두 함수는
--   SECURITY DEFINER 이고 내부 auth 가드가 `auth.uid() is not null AND not owner_admin` 이라,
--   anon(auth.uid()=null)은 가드를 통과한다 → 비로그인 anon key 로 /rpc/ 직접 호출 시 임의 회원
--   상태 변경(권한 승격 team_role_cd='owner' 포함)·삭제가 가능한 IDOR/권한상승 취약점.
--
-- 조치: 두 함수의 authenticated·anon EXECUTE 를 명시 회수한다. 앱의 모든 호출 경로는
--   service_role(createAdminClient)이라 서버 동작에는 영향이 없다. (fresh DB 는 각 RPC 파일이
--   이미 `from public, authenticated, anon` 으로 회수하므로 이 백필은 no-op.)

revoke execute on function public.apply_team_mem_rel_change(uuid, jsonb, timestamptz) from authenticated, anon;
revoke execute on function public.apply_team_mem_rel_delete(uuid, timestamptz) from authenticated, anon;
