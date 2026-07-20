/**
 * 모임 취소 시점에 따른 사유 필수 여부 판정.
 *
 * 정책(오너 확정): 모임 시작 GATHERING_CANCEL_IMMINENT_HOURS 시간 전부터의 취소는 사유 필수,
 * 그 전까지는 사유 선택. 클라이언트(취소 모달)와 서버(toggleGatheringAttendance) 양쪽에서
 * 이 함수를 재사용해 판정 기준을 일치시킨다(클라이언트만 믿지 않음).
 *
 * 주의: sttAt 은 DB(gthr_mst.stt_at)에서 온 UTC ISO 문자열이다.
 * SG-04 의 `imminent.ts` 가 다루는 datetime-local(로컬 오프셋 없는) 문자열과는 형식이 다르므로
 * 그 함수를 재사용하지 말 것 — 여기서는 항상 `import { dayjs } from "@/lib/dayjs"` 만 사용한다.
 */

import { dayjs } from "@/lib/dayjs";

export const GATHERING_CANCEL_IMMINENT_HOURS = 5;

/**
 * 취소 시점 기준으로 사유가 필수인지 판정한다.
 * - 시작까지 남은 시간이 GATHERING_CANCEL_IMMINENT_HOURS 미만(이미 시작한 경우 포함) → true(필수)
 * - 정확히 GATHERING_CANCEL_IMMINENT_HOURS 이상 남았으면 → false(선택)
 *
 * @param sttAt 모임 시작 시각(UTC ISO 문자열, gthr_mst.stt_at)
 * @param now 기준 시각(테스트용, 생략 시 현재 시각)
 */
export function isCancelReasonRequired(sttAt: string, now: dayjs.Dayjs = dayjs()): boolean {
  const hoursUntilStart = dayjs(sttAt).diff(now, "hour", true);
  return hoursUntilStart < GATHERING_CANCEL_IMMINENT_HOURS;
}
