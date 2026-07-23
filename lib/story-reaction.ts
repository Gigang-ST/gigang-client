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
 * 1인 1항목 응원 상한. **DB CHECK(`ck_rctn_mst_rctn_cnt`, 1~99)와 같은 값이어야 한다.**
 * 여기서 막는 건 UI 편의고, 실제 강제는 DB가 한다(`bump_story_rctn`이 LEAST로 포화시킨다).
 */
export const MAX_MY_RCTN = 99;

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
