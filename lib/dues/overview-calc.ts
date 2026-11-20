/**
 * 통장 전체 잔액·명목별 현황의 순수 계산(#710).
 * 통장 잔액 = 프로젝트 보유액 + 예치금 + 운영자금·공금 순액 + 자유 회비.
 * 운영자금 입출금·공금 반환은 회비도 프로젝트도 아니라 자유 회비로 섞이면 안 된다.
 */

export type FundTxn = { fee_item_cd: string | null; txn_io_enm: string; txn_amt: number };

/** 운영자금·공금 반환 확정 거래의 순액(입금 − 출금) */
export function sumOperatorFundNet(txns: FundTxn[]): number {
  return txns
    .filter((t) => t.fee_item_cd === "opr_fund" || t.fee_item_cd === "fund_return")
    .reduce((s, t) => s + (t.txn_io_enm === "deposit" ? t.txn_amt : -t.txn_amt), 0);
}

/** 자유 회비 = 통장 잔액 − 프로젝트 − 예치금 − 운영자금·공금 순액. 통장 잔액이 없으면 null */
export function calcFreeFund(input: {
  bankBalance: number | null;
  projectTotal: number;
  prepaidTotal: number;
  operatorFundNet: number;
}): number | null {
  if (input.bankBalance === null) return null;
  return input.bankBalance - input.projectTotal - input.prepaidTotal - input.operatorFundNet;
}
