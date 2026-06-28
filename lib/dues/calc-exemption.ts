import { DUES_QUEST } from "@/lib/constants/dues-quest";

/**
 * 출석 기반 회비 감면 계산에 필요한 멤버의 월간 활동 집계.
 * `get_member_monthly_activity` RPC(설계 §4)가 내놓는 중립적 숫자.
 */
export type AttendStats = {
  /** 해당 월 총 참석 횟수(타입 무관) */
  attendCnt: number;
  /** 해당 월 정모(regular) 참석 횟수 — 게이트 판정용 */
  regularAttendCnt: number;
  /** 해당 월 본인이 개설한 모임 수 — 게이트 판정용 */
  hostedCnt: number;
};

/** `calcExemption` 결과. 배치는 `exmAmt`만, 퀘스트 카드는 나머지도 사용(설계 §7). */
export type ExemptionResult = {
  /** 게이트(정모 참석 OR 벙 개설) 통과 여부 */
  gatePassed: boolean;
  /** 게이트 표시용 세부("정모 N · 개설 N") */
  gateDetail: { regularAttend: number; hosted: number };
  /** 총 참석 횟수 */
  attendCnt: number;
  /** 현재 감면액(원). 게이트 미통과 시 0 */
  exmAmt: number;
  /** 다음 티어까지 진행도 안내(게이트와 무관). 마지막 티어 달성 시 undefined */
  nextTier?: { attendCnt: number; remaining: number; exmAmt: number };
  /** 전체 티어 목록(오름차순) — 카드 진행바 마커용. 횟수·금액·현재 달성여부 */
  tiers: { attendCnt: number; exmAmt: number; reached: boolean }[];
  /** 사유 텍스트 */
  reason: string;
};

/**
 * 게이트 + 티어 판정으로 당월 회비 감면액을 계산하는 순수 함수.
 *
 * 규칙은 한 곳(이 함수 + `DUES_QUEST` 상수)에 두고, 배치(§8)와 퀘스트 카드(§7)가
 * **같은 함수를 호출**해 결과 어긋남을 막는다.
 *
 * - 게이트: 정모 1회 참석 OR 벙 1회 개설 — 하나만 충족해도 통과. 미통과면 참석이 많아도 0원.
 * - 티어: 게이트 통과 전제로 참석 4회→50%, 8회→전액. 단계형(누적 아님).
 * - 면제액은 월 회비를 초과할 수 없다(전액이 상한). 반올림은 `Math.round` + `Math.min` 클램프.
 *
 * @param stats 멤버의 당월 활동 집계
 * @param monthlyFeeAmt 해당 월에 적용되던 회비 단가(현재 단가 아님 — 과거 소급 정확성)
 */
export function calcExemption(stats: AttendStats, monthlyFeeAmt: number): ExemptionResult {
  const amtFor = (ratio: number) => Math.min(Math.round(monthlyFeeAmt * ratio), monthlyFeeAmt);
  const gateDetail = { regularAttend: stats.regularAttendCnt, hosted: stats.hostedCnt };
  const tiersDesc = [...DUES_QUEST.tiers].sort((a, b) => b.attendCnt - a.attendCnt);
  const tiersAsc = [...DUES_QUEST.tiers].sort((a, b) => a.attendCnt - b.attendCnt);

  // 전체 티어 목록(오름차순) — 카드 진행바 마커용. reached = 참석 횟수로 도달했는지(게이트와 무관)
  const tiers = tiersAsc.map((t) => ({
    attendCnt: t.attendCnt,
    exmAmt: amtFor(t.exmRatio),
    reached: stats.attendCnt >= t.attendCnt,
  }));

  // 다음 티어(아직 못 넘은 가장 가까운 티어) — 게이트와 무관하게 진행도 안내용
  const next = tiersAsc.find((t) => stats.attendCnt < t.attendCnt);
  const nextTier = next
    ? { attendCnt: next.attendCnt, remaining: next.attendCnt - stats.attendCnt, exmAmt: amtFor(next.exmRatio) }
    : undefined;

  const gatePassed =
    stats.regularAttendCnt >= DUES_QUEST.gate.regularAttend ||
    stats.hostedCnt >= DUES_QUEST.gate.hosted;
  if (!gatePassed) {
    return { gatePassed: false, gateDetail, attendCnt: stats.attendCnt, exmAmt: 0, nextTier, tiers, reason: "게이트 미충족" };
  }

  const tier = tiersDesc.find((t) => stats.attendCnt >= t.attendCnt);
  const exmAmt = tier ? amtFor(tier.exmRatio) : 0;
  return {
    gatePassed,
    gateDetail,
    attendCnt: stats.attendCnt,
    exmAmt,
    nextTier,
    tiers,
    reason: tier ? `출석 ${stats.attendCnt}회 / ${tier.exmRatio === 1 ? "전액 면제" : "감면"}` : "참석 횟수 부족",
  };
}
