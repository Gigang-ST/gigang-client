import type { ConfirmItem } from "@/app/actions/dues/confirm-transactions";

export type ItemCd = "due" | "event_fee" | "other";

export type Decision = {
  memId: string | null;
  itemCd: ItemCd;
  remember: boolean;
  /** 프로젝트(event_fee) 귀속 대상 — 프로젝트 분류에서만 의미 있음 */
  prjId: string | null;
};

type TxnRef = { txnId: string; rawName: string };

/**
 * 확정 액션에 넘길 payload를 순수하게 구성한다.
 * - autoDone·excluded: 업로드 시 저장된 분류를 유지하므로 txnId만.
 * - review: 로컬 판단(분류·회원·프로젝트)을 함께 넘긴다. 회원 매칭은 회비뿐 아니라
 *   프로젝트(event_fee)에도 저장한다 — "누가 이 프로젝트에 냈나"가 명단의 핵심.
 *   제외(other)만 memId를 비운다. prjId는 프로젝트 분류에서만.
 * - aliasLearn: "기억하기" 체크된 회비+회원 건만(확정 성공 후 학습).
 */
export function buildConfirmPayload(input: {
  autoDone: TxnRef[];
  excluded: TxnRef[];
  review: TxnRef[];
  decisions: Record<string, Decision>;
}): { items: ConfirmItem[]; aliasLearn: { rawName: string; memId: string }[] } {
  const autoDoneItems: ConfirmItem[] = input.autoDone.map((t) => ({ txnId: t.txnId }));
  const excludedItems: ConfirmItem[] = input.excluded.map((t) => ({ txnId: t.txnId }));
  const reviewItems: ConfirmItem[] = input.review.map((t) => {
    const d = input.decisions[t.txnId];
    // 순수 함수 계약: 모든 review 항목은 대응하는 decision을 가져야 한다. 없으면
    // 모호한 TypeError 대신 명확한 에러로 계약 위반을 드러낸다(aliasLearn도 d를 쓰므로 여기서 선차단).
    if (!d) throw new Error(`buildConfirmPayload: review 항목 ${t.txnId}에 대응하는 decision이 없습니다`);
    return {
      txnId: t.txnId,
      feeItemCd: d.itemCd,
      memId: d.itemCd === "other" ? null : d.memId,
      prjId: d.itemCd === "event_fee" ? d.prjId : null,
    };
  });

  const aliasLearn = input.review
    .map((t) => ({ t, d: input.decisions[t.txnId] }))
    .filter(({ d }) => d.remember && d.itemCd === "due" && d.memId)
    .map(({ t, d }) => ({ rawName: t.rawName, memId: d.memId! }));

  return { items: [...autoDoneItems, ...excludedItems, ...reviewItems], aliasLearn };
}
