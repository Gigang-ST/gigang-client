/**
 * 팀별 캐시 태그 — `기본태그:팀ID`.
 *
 * 팀 데이터 캐시(`unstable_cache`)는 **공용 태그 + 팀 태그** 둘을 같이 단다(`teamCacheTags`).
 * - 평소 무효화는 **팀 태그만** 턴다(`teamCacheTag`). 울산에서 모임 하나를 고쳤다고 기강 캘린더까지
 *   다시 계산하지 않게. 팀이 늘수록 공용 태그 무효화는 팀 수만큼 재계산을 부른다.
 * - 공용 태그는 "어느 팀인지 모를 때 전부 털기"용으로만 남긴다(DB 웹훅이 팀을 못 실어 보낸 경우 등).
 *
 * 전당(`records` / `records:${teamId}`)이 처음부터 이 모양이었다 — 같은 규칙을 나머지 캐시에 맞춘다.
 * 의존성 없는 모듈로 둔다: 서버 액션 단위 테스트가 server-only 모듈을 끌고 오지 않게
 * (`lib/home-calendar-cache-tag.ts` 와 같은 이유).
 */
export function teamCacheTag(base: string, teamId: string): string {
  return `${base}:${teamId}`;
}

/** 캐시에 다는 태그 — 공용 + 팀 */
export function teamCacheTags(base: string, teamId: string): string[] {
  return [base, teamCacheTag(base, teamId)];
}
