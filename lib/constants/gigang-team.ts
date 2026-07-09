/**
 * `team_cd → team_id` 정본 매핑.
 *
 * 팀 UUID는 시드 후 불변이라 DB 조회 없이 코드 상수로 해석한다(dev/prd 동일 값 확인됨).
 * 멀티팀이 실제로 생기면 이 맵에 한 줄 추가한다(새 팀 = 새 서브도메인 = 배포 이벤트).
 * 코드 배포 없이 팀을 추가해야 하는 규모가 오면 `request-team.ts`에서 DB 조회를 되살린다.
 *
 * 업무 로직에서는 `getRequestTeamContext()` / `resolveTeamContextFromHost()`의 `teamId`를 쓴다.
 */
export const TEAM_ID_BY_CD: Record<string, string> = {
  gigang: "c0ffee00-0000-4000-8000-000000000001",
};

/**
 * `team_cd` 매칭 실패·localhost 등 Host만으로 팀을 정할 수 없을 때의 폴백 UUID.
 * (`team_cd = gigang` 정본, P0/P2 백필과 동일)
 */
export const DEFAULT_FALLBACK_TEAM_ID = TEAM_ID_BY_CD.gigang;
