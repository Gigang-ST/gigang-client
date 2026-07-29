import type { RctnCd, StoryEntityType } from "@/lib/queries/story-feed";

/**
 * 전광판 응원 — 표시 규칙과 한도 한 곳.
 *
 * 서버 액션 파일(`"use server"`)은 async 함수만 export할 수 있어 상수를 둘 수 없고,
 * 피드 쿼리(`lib/queries/story-feed.ts`)는 `server-only`라 클라이언트가 import할 수 없다.
 * 양쪽이 공유하는 값은 여기 모은다.
 */

/** 리액션 코드 → 이모지 + 라벨 (정본 6종 중 전광판에서 쓰는 것) */
export const RCTN_LABEL: Record<RctnCd, { emoji: string; label: string }> = {
  welcome: { emoji: "👏", label: "환영" },
  fire: { emoji: "🔥", label: "대박" },
  cheer: { emoji: "💪", label: "응원" },
  clap: { emoji: "👏", label: "짝짝" },
  lol: { emoji: "😂", label: "ㅋㅋ" },
  boo: { emoji: "😈", label: "야유" },
};

/**
 * 응원은 상한이 없다 — 누른 만큼 무한히 쌓인다(카운터는 DB에 그대로 누적).
 *
 * 다만 버튼 폭은 고정이라 숫자는 네 자리까지만 보이게 감는다: 표시값 = `count % RCTN_ROLL`이라
 * 9999 다음이 0으로 보인다. **실제 누적치는 줄지 않는다** — 화면만 한 바퀴 돌 뿐.
 */
export const RCTN_ROLL = 10000;

/** 화면에 보일 감긴 카운트(0~9999). 실제 누적치는 건드리지 않는다. */
export function rolledCount(count: number): number {
  return count % RCTN_ROLL;
}

/** 한 바퀴라도 돌았나(실제 누적 ≥ 10000) — 넘긴 순간부터 빨강으로 표시한다. */
export function isRolledOver(count: number): boolean {
  return count >= RCTN_ROLL;
}

/** 한 번의 flush가 담을 수 있는 최대 증분 — 클라이언트 디바운스와 서버 검증이 공유한다 */
export const MAX_RCTN_DELTA = 20;

/** `entity_type:entity_id` → 내가 그 항목에 누른 누적 횟수 */
export type MyReactionMap = Record<string, number>;

/**
 * 오버레이 맵 키 — 피드 캐시(공개 집계)와 내 리액션을 합칠 때 양쪽이 같은 규칙을 써야 한다.
 * 순수 함수라 서버(조회)·클라이언트(리드 보정)가 함께 쓴다 — `story-feed.ts`는 `server-only`라
 * 여기(공유 상수 파일)에 둔다.
 */
export function reactionKey(
  entityType: StoryEntityType,
  entityId: string,
): string {
  return `${entityType}:${entityId}`;
}
