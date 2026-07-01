"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { confirmAndRecalc } from "@/app/actions/dues/confirm-and-recalc";
import { buildConfirmPayload, type Decision, type ItemCd } from "@/lib/dues/confirm-payload";
import { duplicateNames } from "@/lib/dues/homonyms";
import type { InboxTxn, MemberOption } from "@/lib/queries/dues";

import { EmptyState } from "@/components/common/empty-state";
import { Caption, H2 } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { InboxRow, ITEM_LABEL, ITEM_ORDER, memberNameById } from "./inbox-row";

type Filter = "all" | "needsReview" | "autoDone" | "excluded";

/** 확인필요 행의 초기 판단값: 최상위 후보 + 회비 분류. */
function defaultDecision(t: InboxTxn): Decision {
  return { memId: t.candidates[0]?.memId ?? null, itemCd: "due", remember: false };
}

export function InboxTable({ members, txns }: { members: MemberOption[]; txns: InboxTxn[] }) {
  const review = useMemo(() => txns.filter((t) => t.bucket === "needsReview"), [txns]);
  const autoDone = useMemo(() => txns.filter((t) => t.bucket === "autoDone"), [txns]);
  const excluded = useMemo(() => txns.filter((t) => t.bucket === "excluded"), [txns]);

  const dupNames = useMemo(() => duplicateNames(members), [members]);
  const nameById = useMemo(() => memberNameById(members), [members]);

  const [overrides, setOverrides] = useState<Record<string, Partial<Decision>>>({});
  const [filter, setFilter] = useState<Filter>("needsReview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const router = useRouter();

  const decisions = useMemo<Record<string, Decision>>(
    () => Object.fromEntries(review.map((t) => [t.txnId, { ...defaultDecision(t), ...overrides[t.txnId] }])),
    [review, overrides],
  );

  // 필터 + 검색으로 화면에 보일 행. 서버 정렬(txn_dt asc) 유지.
  const visible = useMemo(() => {
    const byFilter = txns.filter((t) => filter === "all" || t.bucket === filter);
    const q = query.trim();
    if (!q) return byFilter;
    return byFilter.filter((t) => t.rawName.includes(q) || String(t.amt).includes(q));
  }, [txns, filter, query]);

  // 키보드 ↑↓ 이동 대상: 화면에 보이는 needsReview 행 순서.
  const editableVisible = useMemo(() => visible.filter((t) => t.bucket === "needsReview"), [visible]);

  const allDecided = review.every((t) => {
    const d = decisions[t.txnId];
    return d && (d.itemCd !== "due" || d.memId);
  });
  const totalToConfirm = autoDone.length + review.length + excluded.length;

  const selectableIds = editableVisible.map((t) => t.txnId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function setDecision(txnId: string, patch: Partial<Decision>) {
    setOverrides((prev) => ({ ...prev, [txnId]: { ...prev[txnId], ...patch } }));
  }

  function toggleSelect(txnId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(txnId);
      else next.delete(txnId);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(selectableIds) : new Set());
  }

  function bulkSetItemCd(itemCd: ItemCd) {
    const ids = [...selected].filter((id) => review.some((t) => t.txnId === id));
    setOverrides((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...next[id], itemCd };
      return next;
    });
  }

  function focusByOffset(txnId: string, dir: -1 | 1) {
    const idx = editableVisible.findIndex((t) => t.txnId === txnId);
    const target = editableVisible[idx + dir];
    if (target) rowRefs.current[target.txnId]?.focus();
  }

  function onSubmit() {
    const { items, aliasLearn } = buildConfirmPayload({ autoDone, excluded, review, decisions });
    startTransition(async () => {
      const res = await confirmAndRecalc({ items, aliasLearn });
      setMsg(res.ok ? `확정 ${res.confirmed}건 · 재계산 ${res.recalculated}명 완료` : res.message);
      if (res.ok) router.refresh();
    });
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "전체", count: txns.length },
    { key: "needsReview", label: "확인필요", count: review.length },
    { key: "autoDone", label: "자동", count: autoDone.length },
    { key: "excluded", label: "제외", count: excluded.length },
  ];

  return (
    <div className="flex flex-col gap-4 px-6 pb-24 pt-4">
      <H2>거래내역 처리</H2>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Button
            key={c.key}
            type="button"
            size="sm"
            variant={filter === c.key ? "default" : "outline"}
            onClick={() => setFilter(c.key)}
          >
            {c.label} {c.count}
          </Button>
        ))}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="입금자·금액 검색"
          className="ml-auto h-8 w-44"
        />
      </div>

      {totalToConfirm === 0 ? (
        <EmptyState variant="card" message="처리할 거래가 없습니다." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-t border-border text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-2 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) => toggleSelectAll(c === true)}
                    disabled={selectableIds.length === 0}
                  />
                </th>
                <th className="px-2 py-2"><Caption>날짜</Caption></th>
                <th className="px-2 py-2"><Caption>입금자</Caption></th>
                <th className="px-2 py-2 text-right"><Caption>금액</Caption></th>
                <th className="px-2 py-2"><Caption>매칭 회원</Caption></th>
                <th className="px-2 py-2"><Caption>분류</Caption></th>
                <th className="px-2 py-2"><Caption>상태</Caption></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <InboxRow
                  key={t.txnId}
                  txn={t}
                  members={members}
                  dupNames={dupNames}
                  nameById={nameById}
                  decision={t.bucket === "needsReview" ? decisions[t.txnId] : null}
                  selected={selected.has(t.txnId)}
                  editable={t.bucket === "needsReview"}
                  onChange={(patch) => setDecision(t.txnId, patch)}
                  onToggleSelect={(checked) => toggleSelect(t.txnId, checked)}
                  rowRef={(el) => {
                    rowRefs.current[t.txnId] = el;
                  }}
                  onArrow={(dir) => focusByOffset(t.txnId, dir)}
                  onEnterNext={() => focusByOffset(t.txnId, 1)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2">
          <Caption className="text-foreground">선택 {selected.size}건</Caption>
          {ITEM_ORDER.map((cd) => (
            <Button key={cd} type="button" size="xs" variant="outline" onClick={() => bulkSetItemCd(cd)}>
              {ITEM_LABEL[cd]}로
            </Button>
          ))}
        </div>
      )}

      {msg && <Caption className="text-foreground">{msg}</Caption>}

      <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-3">
        <Button
          className="w-full"
          disabled={pending || !allDecided || totalToConfirm === 0}
          onClick={onSubmit}
        >
          {pending ? "처리 중…" : `${totalToConfirm}건 확정 + 회비 재계산`}
        </Button>
      </div>
    </div>
  );
}
