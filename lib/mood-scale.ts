/**
 * 기강 척도 — 개인 컨디션(프로필 카드)과 크루 활동 지수(전광판 오버뷰)가 **공유하는 4단계 어휘**.
 *
 * 두 지표는 판정 기준이 다르다(개인은 90일 절대 건수, 크루는 직전 4주 대비 비율).
 * 그런데도 라벨을 같이 쓰는 이유는, 개인 카드에서 "기강 잡아"를 본 사람이 크루 박스에서도
 * 같은 말을 만나야 두 지표가 같은 척도라는 게 설명 없이 전달되기 때문이다.
 *
 * 그래서 라벨 문자열은 여기 한 곳에만 둔다. 각 파일이 따로 들고 있으면 한쪽만 고쳐졌을 때
 * 어휘가 어긋나고, 그 순간 "같은 척도"라는 메시지가 조용히 깨진다.
 */

/** 단계 키 — 낮은 쪽부터 dormant → resting → steady → blazing */
export type MoodLevel = "blazing" | "steady" | "resting" | "dormant";

/**
 * 단계별 게이지 점등 칸수.
 *
 * **단계 이름표는 팀 문구로 옮겼다**(`lib/team-copy.ts` 의 `moodLabels`, 2026-11-10). 기강 이름표
 * 「기강 그 자체 / 기강 잡아 / 기며든다」는 「기강」(규율) 말장난이라 다른 팀에 옮기면 말이 안 돼서다.
 * 다른 팀은 중립 이름표(불타는 중 / 꾸준히 / 스며드는 중 / 실종)를 쓴다.
 * `message`는 지표마다 근거가 달라서(개인은 활동 건수, 크루는 4주 대비) 여기 두지 않는다.
 */
export const MOOD_SCALE = {
  blazing: { litSteps: 4 },
  steady: { litSteps: 3 },
  resting: { litSteps: 2 },
  dormant: { litSteps: 1 },
} as const satisfies Record<MoodLevel, { litSteps: number }>;

/** 게이지 총 칸수 — 4단계이므로 4 */
export const MOOD_STEPS = 4;
