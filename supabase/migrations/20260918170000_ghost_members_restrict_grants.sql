-- 현상수배 RPC를 service_role 전용으로 좁힌다.
--
-- 왜: `get_team_ghost_members`는 SECURITY DEFINER인데 **호출자가 그 팀 사람인지 안 본다**
-- (인자로 받은 p_team_id를 그대로 믿는다). 그런데 최초 마이그레이션(20260723160000)이
-- anon·authenticated에도 EXECUTE를 줘 뒀고, `CREATE OR REPLACE FUNCTION`은 권한을
-- 그대로 물려주므로 그 뒤 세 번을 갈아엎는 동안 계속 열린 채였다. 팀 id만 알면 남의 팀
-- 멤버의 이름·아바타·마지막 활동일을 통째로 긁을 수 있다.
--
-- 지금 이 함수를 부르는 곳은 `lib/queries/ghost-members.ts` 하나이고 거기서 쓰는 건
-- `createAdminClient()`(server-only, service_role)다. 즉 클라이언트 역할의 EXECUTE는
-- **아무도 안 쓰는 권한**이라 회수해도 잃는 게 없다.
--
-- ⚠️ 앞으로 이 함수를 브라우저에서 부르고 싶어지면 권한을 되돌리지 말고 **함수 안에서
-- 소속을 검사**할 것. 인자로 받은 팀을 믿는 SECURITY DEFINER를 공개 역할에 여는 건
-- 그 자체가 구멍이다.
SET lock_timeout = '3s';

REVOKE ALL ON FUNCTION public.get_team_ghost_members(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_team_ghost_members(uuid, text)
  TO service_role;
