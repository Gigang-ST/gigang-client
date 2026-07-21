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

import { dayjs, parseEventTime } from "@/lib/dayjs";

export const GATHERING_CANCEL_IMMINENT_HOURS = 5;

/**
 * 임박 취소인데 사유가 없을 때 서버(toggleGatheringAttendance)가 던지는 에러 메시지.
 * 클라이언트가 이 메시지를 식별해 취소 모달을 사유 필수 모드로 전환할 수 있도록 상수로 공유한다 —
 * 클라/서버 시각이 5시간 경계에서 미세하게 어긋나 클라만 "선택"으로 보고 사유 없이 보냈을 때의 복구 경로.
 */
export const CANCEL_REASON_REQUIRED_MESSAGE = "시작 5시간 전부터는 취소 사유가 필요해요.";

/**
 * 취소 시점 기준으로 사유가 필수인지 판정한다.
 * - 시작까지 남은 시간이 GATHERING_CANCEL_IMMINENT_HOURS 미만(이미 시작한 경우 포함) → true(필수)
 * - 정확히 GATHERING_CANCEL_IMMINENT_HOURS 이상 남았으면 → false(선택)
 *
 * sttAt에 날짜만("YYYY-MM-DD") 와도 안전하다 — parseEventTime이 KST 자정으로 고정해
 * 실행 환경 타임존에 따라 판정이 갈리는 것을 막는다(evt_stt_at 없이 start_date로 폴백하는 경로 대비).
 *
 * @param sttAt 모임 시작 시각(UTC ISO 문자열, gthr_mst.stt_at). 날짜만 오면 KST 자정으로 해석.
 * @param now 기준 시각(테스트용, 생략 시 현재 시각)
 */
export function isCancelReasonRequired(sttAt: string, now: dayjs.Dayjs = dayjs()): boolean {
  const hoursUntilStart = parseEventTime(sttAt).diff(now, "hour", true);
  return hoursUntilStart < GATHERING_CANCEL_IMMINENT_HOURS;
}
