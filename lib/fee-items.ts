/**
 * 회비 분류(공통코드 `FEE_ITEM_CD`)의 팀 범위.
 *
 * 기본 분류(회비·지출·기타·행사비 …)는 코드가 이름(`due`·`expense`·`other`)으로 쓰는 **공용 항목**이라
 * `team_id` 가 NULL 이고, 관리자가 추가한 항목은 그 팀 것(`team_id` = 팀)이다
 * (`supabase/migrations/20261109190000_team_settings.sql`).
 *
 * - 읽기: 공용 + 이 팀 것. 이 필터를 빠뜨리면 다른 팀이 만든 분류가 선택지에 뜬다.
 * - 쓰기(이름·순서·삭제): **이 팀 것만.** 공용 항목을 고치면 모든 팀이 바뀐다.
 */

/** PostgREST `.or()` 조건 — 공용 + 이 팀 항목 */
export function feeItemTeamFilter(teamId: string): string {
  return `team_id.is.null,team_id.eq.${teamId}`;
}

/** 이 팀이 고칠 수 있는 항목인가(공용 항목은 못 고친다) */
export function isOwnFeeItem(item: { team_id: string | null }, teamId: string): boolean {
  return item.team_id === teamId;
}
