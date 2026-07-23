import type { RctnCd } from "@/lib/queries/story-feed";

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
