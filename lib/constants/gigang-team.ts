/**
 * 기강 단일 팀 `team_mst` 정본 PK (`team_cd = gigang`, P0/P2 백필과 동일).
 *
 * TODO: 멀티팀·팀 컨텍스트 선택이 생기면 세션/클레임·URL 등으로 `team_id`를 주입하고,
 * 본 상수 직참조를 제거한다. (`database-schema-v2-app-migration-plan.md`·`member-domain` §7 참고)
 */
export const GIGANG_TEAM_ID = "c0ffee00-0000-4000-8000-000000000001";
