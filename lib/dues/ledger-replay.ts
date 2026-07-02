import { dayjs } from "@/lib/dayjs";

/**
 * 원장 리플레이 전환 시점(KST). 이 시각 이전에 만들어진 스냅샷 중 가장 오래된 것만
 * "앵커(개시잔액)"로 인정한다 — 컷오버 시딩(2026-06-04)처럼 pay_hist 로 재구성할 수
 * 없는 과거가 녹아 있는 스냅샷이 그 대상이다. 이 시각 이후의 스냅샷은 전부
 * 리플레이로 재현 가능한 파생 캐시이므로 앵커가 될 수 없다(앵커로 삼으면 커서
 * 이전 시점의 늦은 확정·취소를 영영 반영 못 하는 구멍이 재발한다).
 */
export const LEDGER_EPOCH = "2026-07-02T00:00:00+09:00";

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
