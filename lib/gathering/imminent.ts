import { dayjs } from "@/lib/dayjs";

import type { Dayjs } from "dayjs";

const KST = "Asia/Seoul";

/** 이 시간(시) 미만으로 시작까지 남으면 "임박 개설"로 본다. */
export const IMMINENT_THRESHOLD_HOURS = 12;

/**
 * 모임 시작 시각이 "현재로부터 12시간 미만"인지 판정 — 임박 개설 안내 노출 기준.
 *
 * `sttAt`은 개설 폼의 datetime-local 값(오프셋 없는 "YYYY-MM-DDTHH:mm", KST 벽시계 기준)을
 * 그대로 받는다. 서버 액션의 `toUtcIso`와 동일하게 `dayjs.tz(sttAt, "Asia/Seoul")`로 해석한다.
 *
 * 이미 시작 시각이 지난 경우(diff <= 0)는 "임박"이 아니라 별개 케이스이므로 false —
 * 지난/이미 임박했던 모임을 수정할 때 뒤늦게 안내가 뜨는 오탐을 막는다.
 */
export function isImminentGathering(
  sttAt: string | null | undefined,
  now: Dayjs | string = dayjs(),
): boolean {
  if (!sttAt || !dayjs(sttAt).isValid()) return false;

  const target = dayjs.tz(sttAt, KST);

  const nowDayjs = typeof now === "string" ? dayjs(now) : now;
  const diffHours = target.diff(nowDayjs, "hour", true);

  return diffHours > 0 && diffHours < IMMINENT_THRESHOLD_HOURS;
}
