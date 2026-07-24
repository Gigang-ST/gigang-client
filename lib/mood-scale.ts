/**
 * 기강 척도 — 개인 컨디션(프로필 카드)과 크루 기상(전광판)이 **공유하는 4단계 어휘**.
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
 * 단계별 라벨과 게이지 점등 칸수.
 *
 * 양 끝(그 자체/실종)만 "기강"을 쓰고 중간 두 단계는 사실대로 — 과장하지 않기 위해서.
 * `message`는 지표마다 근거가 달라서(개인은 활동 건수, 크루는 4주 대비) 여기 두지 않는다.
 */
export const MOOD_SCALE = {
  blazing: { label: "기강 그 자체", litSteps: 4 },
  steady: { label: "기강 잡아", litSteps: 3 },
  resting: { label: "기며든다", litSteps: 2 },
  dormant: { label: "실종", litSteps: 1 },
} as const satisfies Record<MoodLevel, { label: string; litSteps: number }>;

/** 게이지 총 칸수 — 4단계이므로 4 */
export const MOOD_STEPS = 4;
