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
 * **세는 단위는 이벤트가 아니라 (회원, 모임) 쌍이다** — 모임 상세의 취소자 명단
 * (`deriveCanceledAttendees`)과 같은 규칙이다:
 * - 같은 모임을 여러 번 취소해도 **1번**이다. 그 쌍의 **마지막 취소**만 본다(직전 판정·기간도 그 시각).
 * - 취소했다가 **다시 참석했으면 취소가 아니다** — 지금 `gthr_attd_rel`에 있으면 뺀다.
 *   재참석은 rel INSERT로만 일어나고 이력엔 register가 안 남아서, 이력만 봐선 알 수 없다.
 * 예전엔 취소 이벤트를 하나하나 셌다 — prd 93건 중 7건이 틀렸다(여러 번 취소 2쌍의 중복분
 * 3건 + 재참석 4쌍). 회전문 칭호는 반복 자체를 보는 것이라 이벤트를 세는 게 맞고, 여기와 다르다.
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
 * 취소 이력 조회 칼럼 — 세 곳(프로필·회원 상세·참여 탭)이 이 한 벌을 쓴다.
 * 팀·삭제 필터는 `gthr_mst.team_id` / `gthr_mst.del_yn`로 건다. **기간 필터는 걸지 않는다**
 * ({@link summarizeCancels}가 쌍을 정리한 뒤 건다).
 */
export const CANCEL_HIST_SELECT =
  "mem_id, gthr_id, evt_at, reason_txt, actor_cd, gthr_mst!inner(gthr_nm, stt_at, team_id, del_yn)";

type CancelHistGthr = { gthr_nm: string; stt_at: string };

export type CancelHistRow = {
  mem_id: string;
  gthr_id: string;
  evt_at: string;
  reason_txt: string | null;
  actor_cd: "self" | "admin";
  gthr_mst: CancelHistGthr | CancelHistGthr[];
};

/** {@link CANCEL_HIST_SELECT} 조회 결과 → 취소 이벤트 */
export function toCancelEvents(rows: readonly CancelHistRow[]): CancelEvent[] {
  return rows.map((r) => {
    const g = Array.isArray(r.gthr_mst) ? r.gthr_mst[0] : r.gthr_mst;
    return {
      memId: r.mem_id,
      gthrId: r.gthr_id,
      gthrNm: g.gthr_nm,
      sttAt: g.stt_at,
      evtAt: r.evt_at,
      reason: r.reason_txt,
      actor: r.actor_cd,
    };
  });
}

/** (회원, 모임) 쌍 키 — 재참석 판정용 참석 집합도 이 키로 만든다 */
export function attendKey(memId: string, gthrId: string): string {
  return `${memId}|${gthrId}`;
}

/**
 * 취소 이벤트를 회원별·팀 전체로 집계한다.
 *
 * 먼저 (회원, 모임) 쌍마다 마지막 취소 1건만 남기고, 지금 참석 중인 쌍을 뺀 다음 기간을 건다.
 * **이 순서가 중요하다** — 기간으로 먼저 자르면(예: DB 쿼리에서) 9월에 취소→재참석→10월에
 * 다시 취소한 사람이 9월·10월 양쪽에 잡힌다. 그래서 호출부는 기간 필터 없이 이력을 넘긴다.
 *
 * 기간은 **취소한 시각** 기준이다 — "이번 달 취소"는 이번 달에 누른 취소다.
 * 모임 날짜로 자르면 다음 달 모임을 이번 달에 취소한 게 다음 달 통계로 밀린다.
 *
 * @param attending 지금 참석 중인 쌍 — {@link attendKey}로 만든다. 여기 있으면 취소가 아니다.
 * @param range 생략하면 전체 기간. from 포함, to 미포함.
 */
export function summarizeCancels(
  events: CancelEvent[],
  attending: ReadonlySet<string>,
  range?: { from: dayjs.Dayjs; to: dayjs.Dayjs },
): CancelSummary {
  const byMember = new Map<string, MemberCancelStat>();
  const records: CancelRecord[] = [];
  let imminentTotal = 0;

  // (회원, 모임) 쌍마다 마지막 취소 1건
  const latest = new Map<string, CancelEvent>();
  for (const e of events) {
    const key = attendKey(e.memId, e.gthrId);
    const prev = latest.get(key);
    if (!prev || dayjs(e.evtAt).isAfter(dayjs(prev.evtAt))) latest.set(key, e);
  }

  for (const [key, e] of latest) {
    if (attending.has(key)) continue; // 다시 참석했다 — 취소가 아니다
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
