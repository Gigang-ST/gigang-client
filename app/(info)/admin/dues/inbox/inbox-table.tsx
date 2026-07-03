"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelTransaction } from "@/app/actions/dues/cancel-transaction";
import { confirmAndRecalc } from "@/app/actions/dues/confirm-and-recalc";
import { deleteTransaction } from "@/app/actions/dues/delete-transaction";
import { buildConfirmPayload, type Decision, type ItemCd } from "@/lib/dues/confirm-payload";
import { duplicateNames } from "@/lib/dues/homonyms";
import type { FeeItemOption, InboxTxn, MemberOption, ProcessedTxn, ProjectOption } from "@/lib/queries/dues";

import { EmptyState } from "@/components/common/empty-state";
import { InfoRow } from "@/components/common/info-row";
import { Caption, H2, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { InboxRow, ITEM_LABEL, ITEM_ORDER, memberNameById } from "./inbox-row";
import { ManualTxnButton } from "./manual-txn-button";
import { ProcessedRows } from "./processed-rows";
import { UploadXlsxButton } from "./upload-xlsx-button";

type Filter = "all" | "needsReview" | "autoDone" | "excluded" | "processed";

/**
 * 확인필요 행의 초기 판단값.
 * - 분류·귀속은 **저장값을 시드**로 쓴다 — 수동 등록(event_fee+프로젝트)이나 확정취소로
 *   재노출된 행이 무조건 '회비'로 되돌아가 조용히 개인 납부로 오기록되는 것을 막는다.
 * - 회원은 저장 매칭이 있으면 그것, 없으면 **후보가 딱 1명일 때만** 자동 선택.
 *   후보가 2명 이상(동명이인·복수 유사매칭)이면 비워 둔다 — 운영자가 직접 골라야
 *   확정 가능(그 전엔 미결정으로 강조). 낮은 확신의 자동추측이 그대로 반영되는 것을 막는다.
 */
function defaultDecision(t: InboxTxn): Decision {
  const isEventFee = t.feeItemCd === "event_fee";
  return {
    memId: t.memId ?? (t.candidates.length === 1 ? t.candidates[0].memId : null),
    itemCd: isEventFee ? "event_fee" : "due",
    remember: false,
    prjId: isEventFee ? t.projectId : null,
  };
}

export function InboxTable({
  members,
  txns,
  processed,
  processedCapped,
  processedError = false,
  feeItems,
  projects,
}: {
  members: MemberOption[];
  txns: InboxTxn[];
  processed: ProcessedTxn[];
  /** 처리됨 목록이 조회 한도에 걸려 잘렸는지 — 잘렸으면 화면에 고지한다. */
  processedCapped: boolean;
  /** 처리됨 조회 실패(핵심 triage 저니는 살아있음) — 탭 안에서만 안내한다. */
  processedError?: boolean;
  /** 수동 등록 분류 선택지 — FEE_ITEM_CD 전체 */
  feeItems: FeeItemOption[];
  /** 프로젝트(event_fee) 귀속 선택지 — 모금 중(active)만 */
  projects: ProjectOption[];
}) {
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const router = useRouter();

  const decisions = useMemo<Record<string, Decision>>(
    () => Object.fromEntries(review.map((t) => [t.txnId, { ...defaultDecision(t), ...overrides[t.txnId] }])),
    [review, overrides],
  );

  // 필터 + 검색으로 화면에 보일 행. 서버 정렬(txn_dt asc) 유지.
  const visible = useMemo(() => {
    if (filter === "processed") return [];
    const byFilter = txns.filter((t) => filter === "all" || t.bucket === filter);
    const q = query.trim();
    if (!q) return byFilter;
    return byFilter.filter((t) => t.rawName.includes(q) || String(t.amt).includes(q));
  }, [txns, filter, query]);

  // 처리됨(확정 완료) 행 — 감사·정정용. 서버 정렬(cfm_at desc) 유지, 같은 검색어 적용.
  const visibleProcessed = useMemo(() => {
    if (filter !== "processed") return [];
    const q = query.trim();
    if (!q) return processed;
    return processed.filter(
      (t) => t.rawName.includes(q) || String(t.amt).includes(q) || (t.memName ?? "").includes(q),
    );
  }, [processed, filter, query]);

  // 키보드 ↑↓ 이동 대상: 화면에 보이는 needsReview 행 순서.
  const editableVisible = useMemo(() => visible.filter((t) => t.bucket === "needsReview"), [visible]);

  // 결정된 확인필요 행: 회비=회원 지정, 프로젝트=귀속 프로젝트 지정(회원은 선택), 제외=분류만.
  // 부분 확정 — 미결정 행은 이번 확정에서 빠지고 인박스에 남아 다음에 처리한다.
  // (inbox-row.tsx의 decided 계산과 반드시 같은 규칙을 유지할 것)
  const decidedReview = review.filter((t) => {
    const d = decisions[t.txnId];
    return d && (d.itemCd === "other" || (d.itemCd === "due" ? !!d.memId : !!d.prjId));
  });
  const undecidedCount = review.length - decidedReview.length;

  // 확정 범위: 체크박스로 고른 행이 있으면 **그 중 확정 가능한 행만**, 없으면 전체.
  // 자동·제외는 판단이 필요 없어 항상 확정 대상, 미결정 확인필요 행은 확정 불가라 빠진다.
  const useSelection = selected.size > 0;
  const inScope = (t: { txnId: string }) => !useSelection || selected.has(t.txnId);
  const targetAuto = autoDone.filter(inScope);
  const targetExcluded = excluded.filter(inScope);
  const targetReview = decidedReview.filter(inScope);
  const confirmCount = targetAuto.length + targetExcluded.length + targetReview.length;

  // 체크박스는 확정 범위 지정용 — 화면에 보이는 모든 행(자동·제외 포함)을 선택 대상으로.
  const selectableIds = visible.map((t) => t.txnId);
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
    // 화면에 보이는 행만 더하거나 뺀다 — 다른 필터에서 골라 둔 선택은 유지(통째 교체 금지).
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
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
    const { items, aliasLearn } = buildConfirmPayload({
      autoDone: targetAuto,
      excluded: targetExcluded,
      review: targetReview,
      decisions,
    });
    const confirmedIds = new Set(
      [...targetAuto, ...targetExcluded, ...targetReview].map((t) => t.txnId),
    );
    setMsg(null);
    startTransition(async () => {
      const res = await confirmAndRecalc({ items, aliasLearn });
      setMsg(res.ok ? `확정 ${res.confirmed}건 · 재계산 ${res.recalculated}명 완료` : res.message);
      if (res.ok) {
        // 확정된 행만 선택·편집 상태에서 비운다 — 확정 안 한 행의 로컬 판단은 유지해
        // 다음 확정에서 이어서 처리할 수 있게 한다(새 목록은 refresh로 다시 받음).
        setSelected((prev) => new Set([...prev].filter((id) => !confirmedIds.has(id))));
        setOverrides((prev) => {
          const next = { ...prev };
          confirmedIds.forEach((id) => delete next[id]);
          return next;
        });
        router.refresh();
      }
    });
  }

  function onDeleteTxn(txn: InboxTxn) {
    if (deleteBusyId) return;
    if (!confirm(`${txn.rawName} ${txn.amt.toLocaleString()}원 거래를 삭제하시겠습니까?\n같은 거래가 재업로드돼도 다시 들어오지 않습니다.`)) return;
    setMsg(null);
    setDeleteBusyId(txn.txnId);
    startTransition(async () => {
      const res = await deleteTransaction(txn.txnId);
      setDeleteBusyId(null);
      setMsg(res.ok ? "거래를 삭제했습니다." : res.message);
      if (res.ok) {
        // 삭제된 행이 선택·편집 상태에 남아 "미결정"으로 오집계되지 않도록 정리.
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(txn.txnId);
          return next;
        });
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[txn.txnId];
          return next;
        });
        router.refresh();
      }
    });
  }

  function onCancelProcessed(txn: ProcessedTxn) {
    if (!confirm(`${txn.rawName} ${txn.amt.toLocaleString()}원 확정을 취소하시겠습니까?\n거래가 인박스로 돌아가고 잔액이 복구됩니다.`)) return;
    setMsg(null);
    setCancelBusyId(txn.txnId);
    startTransition(async () => {
      const res = await cancelTransaction(txn.txnId);
      setCancelBusyId(null);
      setMsg(res.ok ? "확정을 취소했습니다. 거래가 인박스로 돌아왔고 잔액도 복구됐습니다." : res.message);
      if (res.ok) router.refresh();
    });
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "전체", count: txns.length },
    { key: "needsReview", label: "확인필요", count: review.length },
    { key: "autoDone", label: "자동", count: autoDone.length },
    { key: "excluded", label: "제외", count: excluded.length },
    { key: "processed", label: "처리됨", count: processed.length },
  ];

  return (
    <div className="flex flex-col gap-4 px-6 pb-24 pt-4">
      <div className="flex items-center justify-between">
        <H2>거래내역 처리</H2>
        <div className="flex items-center gap-2">
          <ManualTxnButton members={members} dupNames={dupNames} feeItems={feeItems} projects={projects} />
          <UploadXlsxButton onResult={setMsg} />
        </div>
      </div>

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

      {filter === "processed" ? (
        processedError ? (
          <EmptyState variant="card" message="처리된 거래를 불러오지 못했습니다. 새로고침해 주세요." />
        ) : visibleProcessed.length === 0 ? (
          <EmptyState
            variant="card"
            message={query.trim() ? "검색 결과가 없습니다." : "아직 처리된 거래가 없습니다."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-t border-border text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2"><Caption>날짜</Caption></th>
                  <th className="px-2 py-2"><Caption>입금자</Caption></th>
                  <th className="px-2 py-2 text-right"><Caption>금액</Caption></th>
                  <th className="px-2 py-2"><Caption>매칭 회원</Caption></th>
                  <th className="px-2 py-2"><Caption>분류</Caption></th>
                  <th className="px-2 py-2"><Caption>처리</Caption></th>
                </tr>
              </thead>
              <tbody>
                <ProcessedRows txns={visibleProcessed} busyId={cancelBusyId} onCancel={onCancelProcessed} />
              </tbody>
            </table>
            {processedCapped && (
              <Micro className="mt-2 block text-muted-foreground">
                최근 처리분만 표시됩니다 — 더 오래된 건은 검색으로도 나오지 않아요.
              </Micro>
            )}
          </div>
        )
      ) : txns.length === 0 ? (
        <EmptyState variant="card" message="처리할 거래가 없습니다. 은행 엑셀을 업로드해 시작하세요." />
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
                  projects={projects}
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
                  onDelete={() => onDeleteTxn(t)}
                  deleteBusy={deleteBusyId !== null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Caption className="text-foreground">선택 {selected.size}건</Caption>
          {ITEM_ORDER.map((cd) => (
            <Button key={cd} type="button" size="xs" variant="outline" onClick={() => bulkSetItemCd(cd)}>
              {ITEM_LABEL[cd]}로
            </Button>
          ))}
          <Micro className="text-muted-foreground">
            선택한 행만 확정됩니다 · 분류 버튼은 확인필요 행에만 적용
          </Micro>
        </div>
      )}

      {msg && <Caption className="text-foreground">{msg}</Caption>}

      {filter !== "processed" && (
        <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-3">
          {useSelection
            ? selected.size > confirmCount && (
                <Caption className="mb-2 block text-muted-foreground">
                  선택 {selected.size}건 중 {selected.size - confirmCount}건은 미결정이라 이번 확정에서 제외
                </Caption>
              )
            : undecidedCount > 0 && (
                <Caption className="mb-2 block text-muted-foreground">
                  미결정 {undecidedCount}건은 이번 확정에서 제외 — 다음에 처리
                </Caption>
              )}
          <Button
            className="w-full"
            disabled={pending || confirmCount === 0}
            onClick={() => setConfirmOpen(true)}
          >
            {pending
              ? "처리 중…"
              : useSelection
                ? `선택 ${confirmCount}건 확정 + 회비 재계산`
                : `전체 ${confirmCount}건 확정 + 회비 재계산`}
          </Button>
        </div>
      )}

      {/* 확정 전 범위 고지 — 지금 보고 있는 필터와 무관하게 미처리 전체가 확정된다 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {useSelection ? `선택한 ${confirmCount}건을 확정할까요?` : `${confirmCount}건을 확정할까요?`}
            </DialogTitle>
          </DialogHeader>
          <div>
            <InfoRow label="자동 매칭" value={`${targetAuto.length}건`} />
            <InfoRow label="제외" value={`${targetExcluded.length}건`} />
            <InfoRow label="확인필요 (결정됨)" value={`${targetReview.length}건`} />
            {useSelection
              ? selected.size > confirmCount && (
                  <InfoRow label="선택 중 제외 (미결정)" value={`${selected.size - confirmCount}건`} />
                )
              : undecidedCount > 0 && (
                  <InfoRow label="미결정 (인박스에 남음)" value={`${undecidedCount}건`} />
                )}
          </div>
          <Caption>
            {useSelection
              ? "체크한 행만 확정되고 회비 잔액에 반영됩니다."
              : "지금 보는 필터와 관계없이 위 항목이 모두 확정되고 회비 잔액에 반영됩니다."}{" "}
            잘못 처리한 건은 &lsquo;처리됨&rsquo;에서 건별로 취소할 수 있습니다.
          </Caption>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              돌아가기
            </Button>
            <Button
              type="button"
              disabled={pending || confirmCount === 0}
              onClick={() => {
                setConfirmOpen(false);
                onSubmit();
              }}
            >
              확정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
