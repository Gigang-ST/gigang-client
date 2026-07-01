import type { ConfirmItem } from "@/app/actions/dues/confirm-transactions";

export type ItemCd = "due" | "event_fee" | "other";

export type Decision = {
  memId: string | null;
  itemCd: ItemCd;
  remember: boolean;
};

type TxnRef = { txnId: string; rawName: string };

/**
 * 확정 액션에 넘길 payload를 순수하게 구성한다.
 * - autoDone·excluded: 업로드 시 저장된 분류를 유지하므로 txnId만.
 * - review: 로컬 판단(분류·회원)을 함께 넘긴다. 회비가 아니면 memId는 null.
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
    return { txnId: t.txnId, feeItemCd: d.itemCd, memId: d.itemCd === "due" ? d.memId : null };
  });

  const aliasLearn = input.review
    .map((t) => ({ t, d: input.decisions[t.txnId] }))
    .filter(({ d }) => d.remember && d.itemCd === "due" && d.memId)
    .map(({ t, d }) => ({ rawName: t.rawName, memId: d.memId! }));

  return { items: [...autoDoneItems, ...excludedItems, ...reviewItems], aliasLearn };
}
