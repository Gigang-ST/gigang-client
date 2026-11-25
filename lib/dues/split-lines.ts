import { carriesProject, directionIssue, isItemDecided, isMemberlessItemCd } from "@/lib/dues/fee-item-direction";

/** 거래 한 건을 나눈 줄 하나 — 줄마다 금액·분류·대상(회원·프로젝트)이 다르다. */
export type SplitLine = {
  amt: number;
  feeItemCd: string;
  memId: string | null;
  prjId: string | null;
};

export const MIN_SPLIT_LINES = 2;

/**
 * 나눈 줄 검증(순수) — 화면과 서버가 같은 규칙을 본다. 문제 없으면 null, 있으면 사람이 읽을 첫 문제.
 * - 줄은 2개 이상, 금액은 1원 이상 정수
 * - 합계 = 원래 거래 금액
 * - 줄마다 분류·방향이 맞고 대상(회원·프로젝트)이 채워져 있어야 한다
 */
export function splitLinesIssue(io: string, totalAmt: number, lines: SplitLine[]): string | null {
  if (lines.length < MIN_SPLIT_LINES) return "2줄 이상으로 나눠야 합니다.";
  for (const [i, l] of lines.entries()) {
    const no = i + 1;
    if (!Number.isInteger(l.amt) || l.amt <= 0) return `${no}번째 줄 금액은 1원 이상의 정수여야 합니다.`;
    if (!l.feeItemCd) return `${no}번째 줄 분류를 골라 주세요.`;
    const dir = directionIssue(io, l.feeItemCd);
    if (dir) return `${no}번째 줄: ${dir}`;
    if (!isItemDecided({ itemCd: l.feeItemCd, memId: l.memId, prjId: l.prjId })) {
      return `${no}번째 줄 대상(회원 또는 프로젝트)을 골라 주세요.`;
    }
  }
  const sum = lines.reduce((s, l) => s + l.amt, 0);
  if (sum !== totalAmt) {
    return `나눈 금액 합계(${sum.toLocaleString()}원)가 거래 금액(${totalAmt.toLocaleString()}원)과 다릅니다.`;
  }
  return null;
}

/** 줄을 저장 형태로 정리 — 회원을 안 붙이는 분류는 회원을, 프로젝트를 못 다는 분류는 프로젝트를 비운다. */
export function normalizeSplitLine(l: SplitLine): SplitLine {
  return {
    amt: l.amt,
    feeItemCd: l.feeItemCd,
    memId: isMemberlessItemCd(l.feeItemCd) ? null : l.memId,
    prjId: carriesProject(l.feeItemCd) ? l.prjId : null,
  };
}
