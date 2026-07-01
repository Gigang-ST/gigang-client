"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { confirmAndRecalc } from "@/app/actions/dues/confirm-and-recalc";
import type { InboxTxn } from "@/lib/queries/dues";

import { EmptyState } from "@/components/common/empty-state";
import { Caption, H2 } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { InboxCard, ITEM_LABEL, ITEM_ORDER, type Decision, type ItemCd } from "./inbox-card";

export function InboxClient({
  members,
  txns,
}: {
  members: { memId: string; name: string }[];
  txns: InboxTxn[];
}) {
  const review = useMemo(() => txns.filter((t) => t.bucket === "needsReview"), [txns]);
  const autoDone = useMemo(() => txns.filter((t) => t.bucket === "autoDone"), [txns]);
  const excluded = useMemo(() => txns.filter((t) => t.bucket === "excluded"), [txns]);

  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(
      review.map((t) => [
        t.txnId,
        { memId: t.candidates[0]?.memId ?? null, itemCd: "due" as const, remember: false },
      ]),
    ),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 묶음: 같은 날짜+금액이면 2건 이상일 때 그룹 헤더에 "일괄 분류" 버튼을 둔다.
  // review는 서버에서 이미 txn_dt 오름차순으로 내려오므로 Map 순회 순서가 그대로 유지된다.
  const groups = useMemo(() => {
    const map = new Map<string, InboxTxn[]>();
    for (const t of review) {
      const key = `${t.txnDt}|${t.amt}`;
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [review]);

  const allDecided = review.every((t) => {
    const d = decisions[t.txnId];
    // 회비는 회원 매칭 필수, 프로젝트/제외는 회원 불필요
    return d && (d.itemCd !== "due" || d.memId);
  });

  function setDecision(txnId: string, patch: Partial<Decision>) {
    setDecisions((prev) => ({ ...prev, [txnId]: { ...prev[txnId], ...patch } }));
  }

  function bulkSetItemCd(txnIds: string[], itemCd: ItemCd) {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of txnIds) next[id] = { ...next[id], itemCd };
      return next;
    });
  }

  function focusNextCard(txnId: string) {
    const idx = review.findIndex((t) => t.txnId === txnId);
    const next = review[idx + 1];
    if (next) cardRefs.current[next.txnId]?.focus();
  }

  function onSubmit() {
    const items = review.map((t) => {
      const d = decisions[t.txnId];
      return { txnId: t.txnId, feeItemCd: d.itemCd, memId: d.itemCd === "due" ? d.memId : null };
    });
    const aliasLearn = review
      .map((t) => ({ t, d: decisions[t.txnId] }))
      .filter(({ d }) => d.remember && d.itemCd === "due" && d.memId)
      .map(({ t, d }) => ({ rawName: t.rawName, memId: d.memId! }));
    const recalcMemIds = [...new Set(items.filter((i) => i.memId).map((i) => i.memId!))];

    startTransition(async () => {
      const res = await confirmAndRecalc({ items, aliasLearn, recalcMemIds });
      setMsg(res.ok ? `확정 ${res.confirmed}건 · 재계산 ${res.recalculated}명 완료` : res.message);
    });
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-24 pt-4">
      <H2>거래내역 처리</H2>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-0 bg-success/15 text-success">자동완료 {autoDone.length}</Badge>
        <Badge className="border-0 bg-warning/15 text-warning">확인필요 {review.length}</Badge>
        <Badge className="border-0 bg-muted text-muted-foreground">제외 {excluded.length}</Badge>
      </div>

      {review.length === 0 ? (
        <EmptyState variant="card" message="확인이 필요한 거래가 없습니다." />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, groupTxns]) => (
            <div key={key} className="flex flex-col gap-3">
              {groupTxns.length > 1 && (
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                  <Caption className="text-foreground">같은 거래 {groupTxns.length}건 일괄 분류</Caption>
                  <div className="flex gap-1.5">
                    {ITEM_ORDER.map((cd) => (
                      <Button
                        key={cd}
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => bulkSetItemCd(groupTxns.map((t) => t.txnId), cd)}
                      >
                        {ITEM_LABEL[cd]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {groupTxns.map((t) => (
                <InboxCard
                  key={t.txnId}
                  txn={t}
                  members={members}
                  decision={decisions[t.txnId]}
                  onChange={(patch) => setDecision(t.txnId, patch)}
                  cardRef={(el) => {
                    cardRefs.current[t.txnId] = el;
                  }}
                  onEnterNext={() => focusNextCard(t.txnId)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {msg && <Caption className="text-foreground">{msg}</Caption>}

      <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-3">
        <Button className="w-full" disabled={!allDecided || pending || review.length === 0} onClick={onSubmit}>
          {pending ? "처리 중…" : `${review.length}건 확정 + 회비 재계산`}
        </Button>
      </div>
    </div>
  );
}
