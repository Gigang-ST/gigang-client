/**
 * `team_mst` 조회 실패·localhost 등 Host만으로 팀을 정할 수 없을 때의 폴백 UUID.
 * (`team_cd = gigang` 정본, P0/P2 백필과 동일)
 *
 * 업무 로직에서는 `getRequestTeamContext()` / `resolveTeamContextFromHost()`의 `teamId`를 쓰고,
 * 이 상수는 `lib/queries/request-team.ts` 폴백에서만 참조한다.
 */
export const DEFAULT_FALLBACK_TEAM_ID =
  "c0ffee00-0000-4000-8000-000000000001";
