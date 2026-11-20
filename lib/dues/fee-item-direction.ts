/**
 * 회비 거래 분류(FEE_ITEM_CD)와 입출금 방향의 짝 규칙 — 앱 확정·운영 MCP가 같은 것을 본다.
 *
 * 개인 잔액(회비 납부원장)에 들어가는 분류는 `due` 하나뿐이다. 그 밖의 분류(운영자금·공금 반환·
 * 예치금 환급·지출·제외 …)는 확정돼도 회원 잔액을 바꾸지 않는다(#710).
 */

export const OPR_FUND_CD = "opr_fund"; // 운영자금 입출금 — 운영자가 운영자금을 넣었다 뺀 것(입금·출금 모두)
export const FUND_RETURN_CD = "fund_return"; // 공금 반환 — 공금을 돌려주거나 다시 넣은 것(입금·출금 모두)
export const DEP_REFUND_CD = "dep_refund"; // 예치금 환급 — 미리 낸 회비를 돌려주는 출금(출금만)

/** 인박스 판단 어휘 — 회원 잔액을 안 건드리는 분류 3종까지 포함 */
export type DecisionItemCd = "due" | "event_fee" | "other" | "opr_fund" | "fund_return" | "dep_refund";

/** 화면 라벨 */
export const DECISION_ITEM_LABEL: Record<DecisionItemCd, string> = {
  due: "회비",
  event_fee: "프로젝트",
  opr_fund: "운영자금",
  fund_return: "공금 반환",
  dep_refund: "예치금 환급",
  other: "제외",
};

/** 회원·프로젝트를 붙이지 않는 분류(회원 잔액에도 프로젝트 보유액에도 안 들어간다) */
export function isNeutralItemCd(cd: string): boolean {
  return cd === OPR_FUND_CD || cd === FUND_RETURN_CD || cd === DEP_REFUND_CD;
}

/** 입금 행에서 고를 수 있는 분류 */
export const DEPOSIT_ITEM_ORDER: DecisionItemCd[] = ["due", "event_fee", "opr_fund", "fund_return", "other"];
/** 출금 행에서 고를 수 있는 분류 */
export const WITHDRAWAL_ITEM_ORDER: DecisionItemCd[] = ["dep_refund", "opr_fund", "fund_return", "other"];

export function itemOrderFor(io: "deposit" | "withdrawal"): DecisionItemCd[] {
  return io === "deposit" ? DEPOSIT_ITEM_ORDER : WITHDRAWAL_ITEM_ORDER;
}

/**
 * 분류·방향 규칙 — 출금을 수입 분류로, 입금을 지출·환급으로 바꾸는 사고를 막는다. 문제 없으면 null.
 * 입출금 방향을 모르면(undefined) 판단하지 않는다.
 */
export function directionIssue(io: string | null | undefined, feeItemCd: string): string | null {
  if (io === "withdrawal" && (feeItemCd === "due" || feeItemCd === "event_fee")) {
    return "출금은 회비·프로젝트 분류로 확정할 수 없습니다.";
  }
  if (io === "deposit" && feeItemCd === "expense") return "입금은 지출 분류로 확정할 수 없습니다.";
  if (io === "deposit" && feeItemCd === DEP_REFUND_CD) return "입금은 예치금 환급 분류로 확정할 수 없습니다.";
  return null;
}
