import { dayjs } from "@/lib/dayjs";

/**
 * 원장 리플레이 전환 시점(KST). 이 시각 이전에 만들어진 스냅샷 중 가장 오래된 것만
 * "앵커(개시잔액)"로 인정한다 — 컷오버 시딩(2026-06-04)처럼 pay_hist 로 재구성할 수
 * 없는 과거가 녹아 있는 스냅샷이 그 대상이다. 이 시각 이후의 스냅샷은 전부
 * 리플레이로 재현 가능한 파생 캐시이므로 앵커가 될 수 없다(앵커로 삼으면 커서
 * 이전 시점의 늦은 확정·취소를 영영 반영 못 하는 구멍이 재발한다).
 */
export const LEDGER_EPOCH = "2026-07-02T00:00:00+09:00";

/**
 * 가입 당월 회비 면제 컷오프(가입일 기준, 포함). 이날 이후 가입자는 가입 당월을
 * 부과하지 않고 다음 달부터 부과한다. join_dt 는 불변이므로 이 조건은 소급 안전 —
 * 재계산을 몇 번 돌려도 컷오프 이전 가입자의 부과는 변하지 않는다.
 * 컷오프 이후 가입자는 리플레이 특성상 배포 시점과 무관하게 자동 소급 적용(백필 불요).
 * 단 이 소급은 "앵커 없는 회원"에 한한다 — 앵커(`LEDGER_EPOCH` 이전 스냅샷) bal_amt 에
 * 이미 녹아든 과거 부과는 리플레이가 재도출하지 못하므로, 컷오프~에포크 경계(2026-07-01~02)에
 * 스냅샷이 생긴 회원이 있으면 그만 수동 정리가 필요하다(현 컷오프 기준 prd 상 대상자 0명).
 */
export const JOIN_MONTH_EXEMPT_FROM = "2026-07-01";

/**
 * 가입일 → 첫 부과월(월초 YYYY-MM-DD). "언제부터 부과하는가" 규칙의 단일 구현 지점 —
 * 잔액 재계산(fromMonth)이 YYYY-MM-DD 를 직접 쓰고, 월 단위 부과 여부 판정은 아래
 * `isMonthCharged` 가 이 함수를 감싼다.
 * 컷오프 비교는 YYYY-MM-DD 문자열 사전순(dayjs 타임존 개입 없음).
 */
export function firstChargeMonth(joinDt: string): string {
  const joinMonth = dayjs(joinDt).startOf("month");
  const start = joinDt >= JOIN_MONTH_EXEMPT_FROM ? joinMonth.add(1, "month") : joinMonth;
  return start.format("YYYY-MM-DD");
}

/**
 * 해당 귀속월(ym = "YYYY-MM")에 이 회원에게 회비가 부과되는가. "부과 여부"를 묻는
 * 모든 소비처(참여 감면 배치 대상 필터·프로필 퀘스트 카드 표시)가 공유하는 단일 술어 —
 * 각자 `firstChargeMonth(...).format("YYYY-MM") <= ym` 을 복제하면 부호(<,<=)·null 처리가
 * 갈라져 "부과 없는 달에 감면이 붙는" 공돈, "카드엔 보이는데 배치는 빠지는" 약속 위반이 샌다.
 * join_dt 가 없으면 부과 시작을 판정할 수 없으므로 false — 잔액 재계산(`!rel?.join_dt → skip`)·
 * 배치가 join_dt 없는 회원을 대상에서 빼는 것과 방향을 일치시킨다.
 */
export function isMonthCharged(joinDt: string | null | undefined, ym: string): boolean {
  if (!joinDt) return false;
  return dayjs(firstChargeMonth(joinDt)).format("YYYY-MM") <= ym;
}

export type PolicyRange = {
  aply_stt_dt: string;
  aply_end_dt: string;
  monthly_fee_amt: number;
};

export type ExmRuleRange = {
  exm_cfg_id: string;
  exm_tp_enm: string;
  exm_amt: number | null;
  aply_stt_dt: string;
  aply_end_dt: string;
};

export type ChargeMonth = {
  /** 귀속월 YYYY-MM */
  aplyYm: string;
  charged: number;
  /** 이 달에 매칭된 면제 규칙(있으면) — 호출측이 exm_hist 존재 확인 후 INSERT */
  exm: { exmCfgId: string; exmAmt: number } | null;
};

/**
 * 부과 개월 목록을 순수하게 계산한다. fromMonth~toMonth(월초 date) 구간을 한 달씩
 * 걸으며, 그 달에 유효한 정책이 있으면 월회비를 부과하고 면제 규칙 매칭을 함께 반환한다.
 * (기존 recalculateBalance 내부 루프를 추출 — 정책·면제 매칭 기준은 월초 날짜(YYYY-MM-DD)
 *  비교로 동일하게 유지한다.)
 */
export function buildChargeMonths(
  policies: PolicyRange[],
  exmRules: ExmRuleRange[],
  fromMonth: string,
  toMonth: string,
): ChargeMonth[] {
  const out: ChargeMonth[] = [];
  let cursor = dayjs(fromMonth).startOf("month");
  const end = dayjs(toMonth).startOf("month");

  while (!cursor.isAfter(end)) {
    const ym = cursor.format("YYYY-MM-DD");
    const policy = policies.filter((p) => p.aply_stt_dt <= ym && p.aply_end_dt >= ym).at(-1);
    if (policy) {
      const rule = exmRules.find((r) => r.aply_stt_dt <= ym && r.aply_end_dt >= ym);
      out.push({
        aplyYm: cursor.format("YYYY-MM"),
        charged: policy.monthly_fee_amt,
        exm: rule
          ? {
              exmCfgId: rule.exm_cfg_id,
              exmAmt: rule.exm_tp_enm === "full" ? policy.monthly_fee_amt : (rule.exm_amt ?? 0),
            }
          : null,
      });
    }
    cursor = cursor.add(1, "month");
  }
  return out;
}

export type ReplayPay = {
  payId: string;
  payAmt: number;
  /** 은행 거래 시각(KST 조합). 원거래 정보가 없으면 pay_dt 자정으로 대체 */
  txnAt: string;
  /** 실제 은행 거래(fee_txn_hist) 연결 여부. 수동 납부(연결 없음)는 커서를 못 민다. */
  fromBankTxn: boolean;
};

/**
 * 앵커 커서 이후의 납부만 리플레이 대상으로 거른다(앵커 잔액에 이미 녹은 과거 제외).
 * 앵커가 없으면 전부 대상. 반환: 합계 + 새 커서(마지막 **은행** 거래 시각 +1초; 없으면 null).
 *
 * 커서는 업로드 baseline cutoff("이 시각 이전 매칭 은행거래는 이미 처리됨")에 쓰이므로
 * 은행 거래가 연결된 납부만 민다 — 수동 납부의 pay_dt 가 커서를 밀면, 그보다 앞선
 * 실제 은행 입금이 늦게 업로드될 때 컷오프에 걸려 조용히 소실된다.
 */
export function replayPays(
  pays: ReplayPay[],
  anchorCursor: string | null,
): { totalPaid: number; lastTxnAt: string | null; lastPayId: string | null } {
  const counted = anchorCursor
    ? pays.filter((p) => dayjs(p.txnAt).isAfter(dayjs(anchorCursor)))
    : pays;
  let lastTxnAt: string | null = null;
  let lastPayId: string | null = null;
  for (const p of counted) {
    if (!p.fromBankTxn) continue;
    const at = dayjs(p.txnAt).add(1, "second").toISOString();
    if (!lastTxnAt || at > lastTxnAt) {
      lastTxnAt = at;
      lastPayId = p.payId;
    }
  }
  return {
    totalPaid: counted.reduce((sum, p) => sum + p.payAmt, 0),
    lastTxnAt,
    lastPayId,
  };
}
