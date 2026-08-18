import { DUES_QUEST } from "@/lib/constants/dues-quest";

/**
 * 참여 기반 회비 감면 계산에 필요한 멤버의 월간 활동 집계.
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
  /** 게이트(정모 참석 OR 모임 개설) 통과 여부 */
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
 * 한 귀속월에 더 줄 수 있는 면제 여유분(원).
 *
 * **면제는 감면이지 환급이 아니다** — 그 달 면제 총액은 그 달 부과액을 넘을 수 없다.
 * `calcExemption`의 `Math.min(..., monthlyFeeAmt)`은 **한 건**의 상한만 지키므로,
 * 같은 달에 면제가 **여러 건** 쌓이면(규칙 면제 `rule_attd` + 참여 감면 `rule_attd_quest`)
 * 합계가 부과액을 넘어 **잔액이 +로 간다**(2026-07 실제 발생: 2,000원 회비에 2,000+2,000).
 *
 * 두 경로가 서로를 모르기 때문에 생기는 일이라, **적재하는 쪽이 그 달 기존 면제를 보고 깎는다.**
 * 잔액 계산에서 뒤늦게 클램프하지 않는 이유는 그러면 **내역(4,000)과 잔액(2,000)이 어긋나**
 * 회원이 "면제받았는데 왜 반영이 덜 됐지"를 묻게 되기 때문이다.
 *
 * @param monthlyFeeAmt      그 달 부과액(그 달에 적용되던 단가)
 * @param alreadyExemptedAmt 그 달에 이미 적재된 면제 합(출처 무관, `del_yn=false`)
 */
export function remainingExemptionRoom(monthlyFeeAmt: number, alreadyExemptedAmt: number): number {
  return Math.max(0, monthlyFeeAmt - Math.max(0, alreadyExemptedAmt));
}

/**
 * 주려는 면제액을 그 달 여유분으로 깎는다. 여유가 없으면 0(= 적재하지 않는다).
 * `remainingExemptionRoom`과 짝이며, 면제를 INSERT하는 모든 경로가 이 함수를 통과해야 한다.
 */
export function capExemptionAmount(
  wantAmt: number,
  monthlyFeeAmt: number,
  alreadyExemptedAmt: number,
): number {
  return Math.min(Math.max(0, wantAmt), remainingExemptionRoom(monthlyFeeAmt, alreadyExemptedAmt));
}

/**
 * 게이트 + 티어 판정으로 당월 회비 감면액을 계산하는 순수 함수.
 *
 * 규칙은 한 곳(이 함수 + `DUES_QUEST` 상수)에 두고, 배치(§8)와 퀘스트 카드(§7)가
 * **같은 함수를 호출**해 결과 어긋남을 막는다.
 *
 * - 게이트: 정모 1회 참석 OR 모임 1회 개설 — 하나만 충족해도 통과. 미통과면 참석이 많아도 0원.
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
    reason: tier ? `참여 ${stats.attendCnt}회 / ${tier.exmRatio === 1 ? "전액 면제" : "감면"}` : "참여 횟수 부족",
  };
}
