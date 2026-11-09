/**
 * `team_cd → team_id` 정본 매핑.
 *
 * 팀 UUID는 시드 후 불변이라 DB 조회 없이 코드 상수로 해석한다(dev/prd 동일 값 — 새 팀은
 * dev·prd 양쪽에 **같은 UUID**로 시드해야 한다. 예: 20261109110000_seed_team_ulsan.sql).
 * 새 팀 = 이 맵 한 줄 + `lib/team-host.ts`의 주소 표 + Vercel 도메인 + Supabase Redirect URLs.
 *
 * 업무 로직에서는 `getRequestTeamContext()`의 `teamId`를 쓴다.
 */
export const TEAM_ID_BY_CD: Record<string, string> = {
  gigang: "c0ffee00-0000-4000-8000-000000000001",
  // 울산지부(임시 주소 ulsan.gigang.team). 시드: 20261109110000_seed_team_ulsan.sql
  ulsan: "c0ffee00-0000-4000-8000-000000000002",
};
