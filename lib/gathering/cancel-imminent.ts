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

/**
 * 대기 순번이 사라지고 선착순으로 열리는 경계.
 *
 * 위 취소 사유 경계(5시간)와 **성격이 다른 규칙이다** — 저쪽은 "이 취소가 남에게 피해를
 * 주는가", 이쪽은 "줄 순서를 지킬 만큼 시간이 남았는가"다. 그래서 값을 공유하지 않되
 * 같은 파일에 나란히 둔다: "임박"의 정의가 흩어지면 한쪽만 바뀐다.
 *
 * ⚠️ 같은 값(2시간)을 `promote_gthr_waitlist`(plpgsql)도 들고 있다. SQL 이 TS 상수를
 * 읽을 수 없어 생기는 중복이라 **한쪽을 바꾸면 반드시 다른 쪽도** 바꾼다.
 *
 * 설계: docs/superpowers/specs/2026-09-11-모임-대기열-임박구간-design.md §2
 */
export const GATHERING_WAITLIST_OPEN_HOURS = 2;

/**
 * 이 모임이 "대기 순번 없이 선착순" 구간에 들어갔는가.
 *
 * true 면 ① 자동 승급을 하지 않고(대신 대기자 전원에게 빈 자리 알림) ② 대기 신청이
 * "빈 자리 알림 요청"의 뜻이 되며 ③ 대기 중인 사람도 자리가 나면 직접 눌러야 한다.
 *
 * 모임이 코앞이면 "가장 오래 기다린 사람"보다 **지금 올 수 있는 사람**이 중요하다 —
 * 대기 1번이 알림을 못 보면 자리는 빈 채로 모임이 시작된다.
 *
 * 경계는 **미만**이다(`isCancelReasonRequired`와 같은 방향) — 정확히 2시간 남은 시점은
 * 아직 대기 순번이 산다.
 *
 * @param sttAt 모임 시작 시각(UTC ISO 문자열, gthr_mst.stt_at). 날짜만 오면 KST 자정으로 해석.
 * @param now 기준 시각(테스트용, 생략 시 현재 시각)
 */
export function isWaitlistOpenToAll(sttAt: string, now: dayjs.Dayjs = dayjs()): boolean {
  return parseEventTime(sttAt).diff(now, "hour", true) < GATHERING_WAITLIST_OPEN_HOURS;
}
