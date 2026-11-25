import { dayjs } from "@/lib/dayjs";

/**
 * 모임 참석 취소가 **시작 시각 기준 어느 쪽**인가 — 노쇼 판단용(#758).
 *
 * - `before_start`: 모임이 시작하기 전에 취소했다(미리 알린 불참).
 * - `after_start`: 시작 시각이 지난 뒤에 취소했다(안 와 놓고 뒤늦게 뺀 경우 — 노쇼 후보).
 *
 * 시작 시각과 **정확히 같은 순간**의 취소는 시작 전으로 본다(시작 시각까지는 미리 취소한 것).
 * 절대 시각 비교라 KST 변환은 필요 없다.
 */
export type CancelTiming = "before_start" | "after_start";

export function classifyCancelTiming(cancelAt: string, startAt: string): CancelTiming {
  return dayjs(cancelAt).isAfter(dayjs(startAt)) ? "after_start" : "before_start";
}

/**
 * 시작 시각으로부터 몇 분 지났는가(시작 후 취소면 양수, 시작 전이면 음수). 분 미만은 버린다.
 * 화면·도구가 "시작 12분 전 취소" / "시작 35분 뒤 취소"로 말하는 데 쓴다.
 */
export function minutesFromStart(cancelAt: string, startAt: string): number {
  return Math.trunc(dayjs(cancelAt).diff(dayjs(startAt), "minute", true));
}
