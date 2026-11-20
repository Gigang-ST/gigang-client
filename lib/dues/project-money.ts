/**
 * 프로젝트 돈 계산(#707) — 화면(목록·상세·현황)과 테스트가 같은 식을 본다.
 * 남은 돈 = 모금(귀속 입금) − 지출(귀속 출금). 마감(정산 완료)한 프로젝트는 남은 돈이 있어도
 * 통장에서 그 프로젝트 몫으로 잡지 않는다 — 보유액 0, 나머지는 자유 회비 쪽으로 돌아간다.
 */
export function projectMoney(raised: number, spent: number, stCd: "active" | "closed") {
  const remaining = raised - spent;
  return {
    raisedAmt: raised,
    spentAmt: spent,
    remainingAmt: remaining,
    heldAmt: stCd === "closed" ? 0 : remaining,
  };
}
