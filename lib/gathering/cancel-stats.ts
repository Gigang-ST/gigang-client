/**
 * 모임 취소 통계 — 관리자 참여 탭·회원 상세가 같은 기준으로 센다.
 *
 * **무엇을 "취소"로 세나**: `gthr_attd_hist`의 `evt_cd='cancel'` 전부 — 본인(self)과
 * 운영진(admin) 둘 다. 운영진 취소는 대개 **본인이 못 와 놓고 취소를 안 눌러서** 운영진이
 * 대신 정리한 것이라(오너 확정), 빼면 가장 나쁜 경우(노쇼)가 통계에서 사라진다.
 * 대기 취소는 참석이 아니었으므로 애초에 이력에 안 남는다.
 *
 * ⚠️ 칭호 평가(`lib/titles/evaluators-gathering.ts` loadSelfCancels)는 **self만** 센다 —
 * 운영진 정리가 그 사람에게 `월요병` 같은 칭호를 발급하면 안 되기 때문이다. 목적이 달라
 * 경계가 다른 것이니 한쪽에 맞춰 다른 쪽을 고치지 말 것.
 *
 * **직전 취소**: 모임 시작 {@link GATHERING_CANCEL_IMMINENT_HOURS}시간 이내 취소.
 * 사유가 필수가 되는 경계(`isCancelReasonRequired`)를 그대로 재사용한다 — "남에게 피해를
 * 주는 취소"의 정의가 두 곳에 흩어지면 한쪽만 바뀐다.
 *
 * 같은 모임을 여러 번 신청·취소하면 **취소한 횟수만큼** 센다(회전문 칭호와 같은 기준).
 */

import { dayjs } from "@/lib/dayjs";
import { isCancelReasonRequired } from "@/lib/gathering/cancel-imminent";

export { GATHERING_CANCEL_IMMINENT_HOURS } from "@/lib/gathering/cancel-imminent";

/** 취소 이벤트 1건 — `gthr_attd_hist` 행에서 필요한 것만 */
export type CancelEvent = {
  memId: string;
  gthrId: string;
  gthrNm: string;
  /** 모임 시작 시각 (timestamptz) */
  sttAt: string;
  /** 취소한 시각 (timestamptz) */
  evtAt: string;
  reason: string | null;
  /** 누가 눌렀나 — admin이면 운영진이 대신 정리한 것(대개 노쇼) */
  actor: "self" | "admin";
};

export type CancelRecord = CancelEvent & { imminent: boolean };

export type MemberCancelStat = { cancelCnt: number; imminentCnt: number };

export type CancelSummary = {
  byMember: Map<string, MemberCancelStat>;
  total: number;
  imminentTotal: number;
  /** 기간 내 취소 — 최신순 */
  records: CancelRecord[];
};

/**
 * 시작 5시간 이내에 취소했는가 (이미 시작한 뒤의 취소 포함).
 * 운영진이 모임 후에 노쇼를 정리한 것도 여기서 직전으로 잡힌다 — 의도다.
 */
export function isImminentCancel(evtAt: string, sttAt: string): boolean {
  return isCancelReasonRequired(sttAt, dayjs(evtAt));
}

/**
 * 취소 이벤트를 회원별·팀 전체로 집계한다.
 *
 * 기간은 **취소한 시각** 기준이다 — "이번 달 취소"는 이번 달에 누른 취소다.
 * 모임 날짜로 자르면 다음 달 모임을 이번 달에 취소한 게 다음 달 통계로 밀린다.
 *
 * @param range 생략하면 전체 기간. from 포함, to 미포함.
 */
export function summarizeCancels(
  events: CancelEvent[],
  range?: { from: dayjs.Dayjs; to: dayjs.Dayjs },
): CancelSummary {
  const byMember = new Map<string, MemberCancelStat>();
  const records: CancelRecord[] = [];
  let imminentTotal = 0;

  for (const e of events) {
    const at = dayjs(e.evtAt);
    if (range && (at.isBefore(range.from) || !at.isBefore(range.to))) continue;
    const imminent = isImminentCancel(e.evtAt, e.sttAt);
    const s = byMember.get(e.memId) ?? { cancelCnt: 0, imminentCnt: 0 };
    s.cancelCnt += 1;
    if (imminent) {
      s.imminentCnt += 1;
      imminentTotal += 1;
    }
    byMember.set(e.memId, s);
    records.push({ ...e, imminent });
  }

  records.sort((a, b) => dayjs(b.evtAt).valueOf() - dayjs(a.evtAt).valueOf());
  return { byMember, total: records.length, imminentTotal, records };
}

/**
 * 취소율 = 취소 ÷ (참석 + 취소). 0~100 정수(%).
 * 참석도 취소도 없으면 null — 0%로 찍으면 "한 번도 안 취소한 성실한 사람"으로 읽힌다.
 */
export function cancelRate(attendCnt: number, cancelCnt: number): number | null {
  const denom = attendCnt + cancelCnt;
  if (denom === 0) return null;
  return Math.round((cancelCnt / denom) * 100);
}
