"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { RotateCcw, UserMinus } from "lucide-react";

import { dayjs } from "@/lib/dayjs";

import { batchDeactivateMembers } from "@/app/actions/admin/manage-member";
import { cancelTransaction } from "@/app/actions/dues/cancel-transaction";
import { confirmTransaction } from "@/app/actions/dues/confirm-transaction";
import { createExemption } from "@/app/actions/dues/create-exemption";
import { matchTransaction } from "@/app/actions/dues/match-transaction";
import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";
import { rollbackSnapshot } from "@/app/actions/dues/rollback-snapshot";
import { rollbackXlsx } from "@/app/actions/dues/rollback-xlsx";
import { updateFeeItem } from "@/app/actions/dues/update-fee-item";
import { uploadXlsx } from "@/app/actions/dues/upload-xlsx";

import { SegmentControl } from "@/components/common/segment-control";
import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Txn = {
  txn_id: string;
  txn_dt: string;
  txn_amt: number;
  txn_io_enm: string;
  raw_name: string;
  raw_memo: string | null;
  adm_memo_txt: string | null;
  txn_tp_txt: string;
  match_st_cd: string;
  mem_id: string | null;
  fee_item_cd: string | null;
  is_cfm_yn: boolean;
  cfm_at: string | null;
  is_stale: boolean;
  mem_mst: { mem_nm: string } | { mem_nm: string }[] | null;
};

type Upload = { upd_id: string; file_nm: string; crt_at: string; upd_st_cd: string };

type MemberRow = {
  mem_id: string;
  mem_nm: string;
  birth_dt: string | null;
  join_dt: string | null;
  snap: { bal_snap_id: string; bal_amt: number; last_calc_dt: string; last_calc_at: string | null } | null;
  is_stale: boolean;
  mem_st_cd: string;
  inact_rsn_txt: string | null;
};

type PayHistRow = {
  pay_id: string;
  mem_id: string;
  mem_nm: string;
  pay_amt: number;
  pay_dt: string;
  pay_st_cd: "paid" | "cancelled";
  fee_item_cd: string | null;
  raw_name: string;
};

type Member = { mem_id: string; mem_nm: string; birth_dt: string | null; join_dt: string | null };
type FeeItemCd = { cd: string; label: string };

function getMemNm(memMst: Txn["mem_mst"]): string | null {
  if (!memMst) return null;
  if (Array.isArray(memMst)) return memMst[0]?.mem_nm ?? null;
  return memMst.mem_nm;
}

function MemberSearchDialog({
  open,
  onClose,
  members,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  onSelect: (memId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = members.filter((m) => m.mem_nm.includes(query));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>회원 검색</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="overflow-y-auto max-h-80 rounded-xl border border-border mt-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>생년월일</TableHead>
                <TableHead>가입일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">
                    <Caption className="text-muted-foreground">검색 결과 없음</Caption>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((m) => (
                <TableRow
                  key={m.mem_id}
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => { onSelect(m.mem_id); onClose(); }}
                >
                  <TableCell><Body>{m.mem_nm}</Body></TableCell>
                  <TableCell><Caption>{m.birth_dt ?? "-"}</Caption></TableCell>
                  <TableCell><Caption>{m.join_dt ? dayjs(m.join_dt).format("YYYY.MM.DD") : "-"}</Caption></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 업로드 탭 ─────────────────────────────────────────────────────────────────

function UploadTab({
  uploads,
  isPending,
  startTransition,
}: {
  uploads: Upload[];
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadXlsx(fd);
      if (res.ok) {
        setUploadMsg(
          `업로드 완료 — 총 ${res.summary.total}건, 매칭 ${res.summary.matched}건, 미매칭 ${res.summary.unmatched}건, 동명이인 ${res.summary.ambiguous}건, 중복 제외 ${res.summary.skipped}건`
        );
        window.location.reload();
      } else {
        setUploadMsg(res.message);
      }
      setUploading(false);
    });
    e.target.value = "";
  }

  function handleRollback(updId: string) {
    if (!confirm("이 업로드를 롤백하시겠습니까? 미확정 거래가 삭제됩니다.")) return;
    startTransition(async () => {
      const res = await rollbackXlsx(updId);
      if (res.ok) {
        window.location.reload();
      } else {
        alert(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>엑셀 업로드</SectionLabel>
        <label className="cursor-pointer">
          <CardItem variant="dashed" className="flex items-center justify-center p-4 gap-2">
            {uploading ? (
              <LoadingSpinner />
            ) : (
              <Body className="text-muted-foreground">파일 선택 또는 드래그앤드롭</Body>
            )}
          </CardItem>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
        {uploadMsg && (
          <Caption className={uploadMsg.includes("완료") ? "text-primary" : "text-destructive"}>
            {uploadMsg}
          </Caption>
        )}
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>업로드 이력</SectionLabel>
          {uploads.map((u) => (
            <CardItem key={u.upd_id} className="flex items-center justify-between p-3">
              <div className="flex flex-col gap-0.5">
                <Body className="text-sm">{u.file_nm}</Body>
                <Caption>{dayjs(u.crt_at).format("YYYY.MM.DD HH:mm")}</Caption>
              </div>
              {u.upd_st_cd !== "rolled_back" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRollback(u.upd_id)}
                  disabled={isPending}
                >
                  롤백
                </Button>
              )}
              {u.upd_st_cd === "rolled_back" && <Badge variant="secondary">롤백됨</Badge>}
            </CardItem>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 거래내역 탭 ───────────────────────────────────────────────────────────────

function TransactionsTab({
  txns: initialTxns,
  members,
  feeItemCds,
  initialFilter,
  isPending,
  startTransition,
}: {
  txns: Txn[];
  members: Member[];
  feeItemCds: FeeItemCd[];
  initialFilter: "all" | "unconfirmed" | "confirmed";
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [txns, setTxns] = useState(initialTxns);
  const [filter, setFilter] = useState<"all" | "unconfirmed" | "confirmed">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchDialog, setMatchDialog] = useState<string | null>(null);

  const filtered = txns.filter((t) => {
    if (filter === "unconfirmed") return !t.is_cfm_yn;
    if (filter === "confirmed") return t.is_cfm_yn;
    return true;
  });

  const confirmableSelected = filtered.filter(
    (t) => selected.has(t.txn_id) && !t.is_cfm_yn && t.match_st_cd === "matched" && !!t.fee_item_cd
  );
  const confirmableAll = filtered.filter(
    (t) => !t.is_cfm_yn && t.match_st_cd === "matched" && !!t.fee_item_cd
  );
  const staleMemIds = [...new Set(txns.filter((t) => t.is_stale && t.mem_id).map((t) => t.mem_id!))];

  const allFilteredIds = filtered.map((t) => t.txn_id);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const isIndeterminate = !isAllSelected && allFilteredIds.some((id) => selected.has(id));

  function toggleAll() {
    if (isAllSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...allFilteredIds]));
    }
  }

  function toggleRow(txnId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(txnId)) next.delete(txnId);
      else next.add(txnId);
      return next;
    });
  }

  async function handleBulkConfirm() {
    for (const t of confirmableSelected) {
      await new Promise<void>((resolve) => {
        startTransition(async () => {
          const res = await confirmTransaction(t.txn_id);
          if (res.ok) {
            setTxns((prev) =>
              prev.map((tx) => (tx.txn_id === t.txn_id ? { ...tx, is_cfm_yn: true, is_stale: true } : tx))
            );
          }
          resolve();
        });
      });
    }
    setSelected(new Set());
  }

  async function handleBulkConfirmAll() {
    for (const t of confirmableAll) {
      await new Promise<void>((resolve) => {
        startTransition(async () => {
          const res = await confirmTransaction(t.txn_id);
          if (res.ok) {
            setTxns((prev) =>
              prev.map((tx) => (tx.txn_id === t.txn_id ? { ...tx, is_cfm_yn: true, is_stale: true } : tx))
            );
          }
          resolve();
        });
      });
    }
  }

  function handleMatch(txnId: string, memId: string) {
    startTransition(async () => {
      const res = await matchTransaction(txnId, memId);
      if (res.ok) {
        const mem = members.find((m) => m.mem_id === memId);
        setTxns((prev) =>
          prev.map((t) =>
            t.txn_id === txnId
              ? { ...t, match_st_cd: res.match_st_cd, mem_id: memId, mem_mst: mem ? { mem_nm: mem.mem_nm } : t.mem_mst }
              : t
          )
        );
      } else {
        alert(res.message);
      }
    });
  }

  function handleFeeItem(txnId: string, val: string) {
    startTransition(async () => {
      const res = await updateFeeItem(txnId, val as "due" | "expense" | "event_fee" | "goods" | "other");
      if (res.ok) {
        setTxns((prev) => prev.map((t) => (t.txn_id === txnId ? { ...t, fee_item_cd: val } : t)));
      } else {
        alert(res.message);
      }
    });
  }

  function handleRecalcStale() {
    if (staleMemIds.length === 0) return;
    startTransition(async () => {
      const res = await recalculateBalance(staleMemIds);
      if (res.ok) {
        alert(`재계산 완료 (${res.updatedCount}명)`);
        window.location.reload();
      } else {
        alert(res.message);
      }
    });
  }

  function handleCancel(txnId: string) {
    if (!confirm("이 거래의 확정을 취소하시겠습니까?")) return;
    startTransition(async () => {
      const res = await cancelTransaction(txnId);
      if (res.ok) {
        setTxns((prev) =>
          prev.map((t) => (t.txn_id === txnId ? { ...t, is_cfm_yn: false, is_stale: true } : t))
        );
      } else if ("needsRollback" in res && res.needsRollback) {
        alert(`${res.message}\n\n회원별 잔액 탭 > 해당 회원 선택 > Snapshot Rollback 버튼을 먼저 실행하세요.`);
      } else {
        alert(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(["unconfirmed", "confirmed", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "unconfirmed" ? "미확정" : f === "confirmed" ? "확정" : "전체"}
          </Button>
        ))}
        {staleMemIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-warning border-warning"
            onClick={handleRecalcStale}
            disabled={isPending}
          >
            {isPending ? <LoadingSpinner /> : `회비 계산 (${staleMemIds.length}명)`}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel>거래 내역 ({filtered.length}건)</SectionLabel>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Caption className="text-muted-foreground">{selected.size}건 선택됨</Caption>
            )}
            <Button
              size="sm"
              disabled={isPending || confirmableSelected.length === 0}
              onClick={handleBulkConfirm}
            >
              {isPending ? <LoadingSpinner className="mr-1 h-3 w-3" /> : null}
              선택 확정
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || confirmableAll.length === 0}
              onClick={handleBulkConfirmAll}
            >
              매칭행 일괄 확정 ({confirmableAll.length})
            </Button>
          </div>
        </div>

        {filtered.length === 0 && (
          <Caption className="text-muted-foreground">해당 내역이 없습니다.</Caption>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={isAllSelected}
                      data-state={isIndeterminate ? "indeterminate" : undefined}
                      onCheckedChange={toggleAll}
                      aria-label="전체 선택"
                    />
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">날짜</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">이름</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">매칭이름</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">분류</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">금액</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const memNm = getMemNm(t.mem_mst);
                  const feeLabel = feeItemCds.find((f) => f.cd === t.fee_item_cd)?.label ?? t.fee_item_cd ?? "-";
                  const isDeposit = t.txn_io_enm === "deposit";
                  return (
                    <TableRow
                      key={t.txn_id}
                      className={t.is_cfm_yn ? "opacity-60" : ""}
                      data-selected={selected.has(t.txn_id) ? "true" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(t.txn_id)}
                          onCheckedChange={() => toggleRow(t.txn_id)}
                          aria-label="행 선택"
                          disabled={isPending}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Caption className="whitespace-nowrap text-xs">
                          {dayjs(t.txn_dt).format("YYYY.MM.DD")}
                        </Caption>
                      </TableCell>
                      <TableCell className="text-center">
                        <Caption className="whitespace-nowrap text-xs">{t.raw_name}</Caption>
                      </TableCell>
                      <TableCell className="text-center">
                        {t.match_st_cd === "matched" && t.is_cfm_yn ? (
                          <Caption className="whitespace-nowrap text-xs">{memNm ?? "-"}</Caption>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {memNm && <Caption className="whitespace-nowrap text-xs">{memNm}</Caption>}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs whitespace-nowrap"
                              onClick={() => setMatchDialog(t.txn_id)}
                              disabled={isPending}
                            >
                              {memNm ? "수정" : "회원 검색"}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {t.is_cfm_yn ? (
                          <Caption className="text-xs">{feeLabel}</Caption>
                        ) : (
                          <div className="flex justify-center">
                            <Select
                              value={t.fee_item_cd ?? "due"}
                              onValueChange={(v) => handleFeeItem(t.txn_id, v)}
                              disabled={isPending}
                            >
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {feeItemCds.map((item) => (
                                  <SelectItem key={item.cd} value={item.cd}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Caption
                          className={`whitespace-nowrap font-semibold text-xs ${
                            isDeposit ? "text-[var(--success)]" : "text-destructive"
                          }`}
                        >
                          {isDeposit ? "+" : "-"}
                          {t.txn_amt.toLocaleString()}원
                        </Caption>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          {t.is_cfm_yn ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-muted-foreground px-2"
                              onClick={() => handleCancel(t.txn_id)}
                              disabled={isPending}
                            >
                              확정 취소
                            </Button>
                          ) : null}
                          {t.is_stale && <Badge variant="outline" className="text-xs text-warning border-warning">미반영</Badge>}
                          <Badge
                            variant={
                              t.match_st_cd === "matched" ? "default"
                              : t.match_st_cd === "ambiguous" ? "secondary"
                              : "destructive"
                            }
                            className="text-xs"
                          >
                            {t.match_st_cd === "matched" ? "매칭" : t.match_st_cd === "ambiguous" ? "동명이인" : "미매칭"}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <MemberSearchDialog
        open={matchDialog !== null}
        onClose={() => setMatchDialog(null)}
        members={members}
        onSelect={(memId) => {
          if (matchDialog) handleMatch(matchDialog, memId);
          setMatchDialog(null);
        }}
      />
    </div>
  );
}

// ─── 회원별 잔액 탭 ────────────────────────────────────────────────────────────

function BalanceTab({
  members,
  initialFilter,
  isPending,
  startTransition,
}: {
  members: MemberRow[];
  initialFilter: "all" | "unpaid";
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unpaid">(initialFilter);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exemptTarget, setExemptTarget] = useState<MemberRow | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [exmForm, setExmForm] = useState({
    exmTpEnm: "full" as "full" | "part",
    exmAmt: "",
    aplySttDt: dayjs().format("YYYY-MM-DD"),
    aplyEndDt: dayjs().endOf("month").format("YYYY-MM-DD"),
    rsnTxt: "",
  });

  const defaultExmForm = () => ({
    exmTpEnm: "full" as "full" | "part",
    exmAmt: "",
    aplySttDt: dayjs().format("YYYY-MM-DD"),
    aplyEndDt: dayjs().endOf("month").format("YYYY-MM-DD"),
    rsnTxt: "",
  });

  function openExemptDialog(m: MemberRow) {
    setExmForm(defaultExmForm());
    setExemptTarget(m);
  }

  function closeExemptDialog() {
    setExemptTarget(null);
    setExmForm(defaultExmForm());
  }

  const unpaidMembers = members.filter((m) => m.snap && m.snap.bal_amt < 0);
  const displayedMembers = filter === "unpaid" ? unpaidMembers : members;

  function toggleMember(memId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memId)) next.delete(memId);
      else next.add(memId);
      return next;
    });
  }

  function toggleAll() {
    const displayedIds = displayedMembers.map((m) => m.mem_id);
    const allSelected = displayedIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) displayedIds.forEach((id) => next.delete(id));
      else displayedIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function handleSendNoti() {
    const memIds = [...selectedIds].join(",");
    router.push(`/admin/notifications?memIds=${memIds}&template=dues_notice`);
  }

  async function handleExemptSubmit() {
    if (!exemptTarget) return;
    startTransition(async () => {
      const res = await createExemption({
        memId: exemptTarget.mem_id,
        exmTpEnm: exmForm.exmTpEnm,
        exmAmt: exmForm.exmTpEnm === "part" ? Number(exmForm.exmAmt) : undefined,
        aplySttDt: exmForm.aplySttDt,
        aplyEndDt: exmForm.aplyEndDt,
        rsnTxt: exmForm.rsnTxt,
      });
      if (res.ok) {
        closeExemptDialog();
        alert("면제 규칙이 등록되었습니다.");
      } else {
        alert(res.message);
      }
    });
  }

  const activeSelectedMembers = [...selectedIds].filter(
    (id) => members.find((m) => m.mem_id === id)?.mem_st_cd === "active"
  );

  const rollbackTargetIds = [...selectedIds].filter(
    (id) => members.find((m) => m.mem_id === id)?.snap != null
  );

  async function handleRollbackSnapshot() {
    if (!rollbackTargetIds.length) return;
    if (!confirm(`선택한 ${rollbackTargetIds.length}명의 스냅샷을 이전 버전으로 롤백하시겠습니까?\n롤백 후 거래 수정이 끝나면 재계산을 실행하세요.`)) return;
    startTransition(async () => {
      const res = await rollbackSnapshot(rollbackTargetIds);
      if (res.ok) {
        alert(`롤백 완료 (${res.rolledBackCount}명). 거래 수정 후 재계산을 실행하세요.`);
        router.refresh();
      } else {
        alert(res.message);
      }
    });
  }

  async function handleDeactivate() {
    if (!deactivateReason.trim()) return;
    startTransition(async () => {
      const res = await batchDeactivateMembers(activeSelectedMembers, deactivateReason.trim());
      if (res.ok) {
        setDeactivateDialogOpen(false);
        setDeactivateReason("");
        setSelectedIds(new Set());
        router.refresh();
      } else {
        alert(res.message);
      }
    });
  }

  const displayedIds = displayedMembers.map((m) => m.mem_id);
  const isAllSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedIds.has(id));
  const isIndeterminate = !isAllSelected && displayedIds.some((id) => selectedIds.has(id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={filter === "unpaid" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter((f) => f === "unpaid" ? "all" : "unpaid")}
        >
          미납 {unpaidMembers.length}명
        </Button>
        {selectedIds.size > 0 && (
          <Button size="sm" onClick={handleSendNoti}>
            알림 전송 ({selectedIds.size}명)
          </Button>
        )}
        {activeSelectedMembers.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeactivateDialogOpen(true)}
            disabled={isPending}
          >
            <UserMinus className="size-3.5 mr-1" />
            비활성 설정 ({activeSelectedMembers.length}명)
          </Button>
        )}
        <div className="flex-1" />
        {rollbackTargetIds.length > 0 && (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleRollbackSnapshot}
            disabled={isPending}
          >
            <RotateCcw className="size-3.5 mr-1" />
            Rollback ({rollbackTargetIds.length}명)
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>회원별 잔액 ({displayedMembers.length}명{filter === "unpaid" ? " · 미납 필터" : ""})</SectionLabel>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">
                  <div className="flex justify-center">
                    <Checkbox
                      checked={isAllSelected}
                      data-state={isIndeterminate ? "indeterminate" : isAllSelected ? "checked" : "unchecked"}
                      onCheckedChange={toggleAll}
                    />
                  </div>
                </TableHead>
                <TableHead className="text-center text-xs whitespace-nowrap">이름</TableHead>
                <TableHead className="text-center text-xs whitespace-nowrap">생년월일</TableHead>
                <TableHead className="text-center text-xs whitespace-nowrap">가입일</TableHead>
                <TableHead className="text-center text-xs whitespace-nowrap">잔액</TableHead>
                <TableHead className="text-center text-xs whitespace-nowrap">기준일</TableHead>
                <TableHead className="text-center text-xs whitespace-nowrap">면제</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedMembers.map((m) => {
                const bal = m.snap?.bal_amt ?? null;
                const isChecked = selectedIds.has(m.mem_id);
                return (
                  <TableRow
                    key={m.mem_id}
                    className={`${isChecked ? "bg-muted/40" : ""} ${m.mem_st_cd === "inactive" ? "opacity-60" : ""}`}
                    onClick={() => toggleMember(m.mem_id)}
                  >
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleMember(m.mem_id)}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Caption className="text-xs font-semibold whitespace-nowrap">{m.mem_nm}</Caption>
                        {m.mem_st_cd === "inactive" && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">비활성</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Caption className="text-xs whitespace-nowrap">{m.birth_dt ?? "-"}</Caption>
                    </TableCell>
                    <TableCell className="text-center">
                      <Caption className="text-xs whitespace-nowrap">
                        {m.join_dt ? dayjs(m.join_dt).format("YYYY.MM.DD") : "-"}
                      </Caption>
                    </TableCell>
                    <TableCell className="text-center">
                      {bal === null ? (
                        <Caption className="text-xs text-muted-foreground">-</Caption>
                      ) : (
                        <Caption
                          className={`text-xs font-semibold whitespace-nowrap ${
                            bal < 0 ? "text-destructive" : bal > 0 ? "text-primary" : ""
                          }`}
                        >
                          {bal > 0 && "+"}{bal.toLocaleString()}원
                        </Caption>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Caption className="text-xs whitespace-nowrap">
                        {m.snap?.last_calc_dt ? dayjs(m.snap.last_calc_dt).format("YYYY.MM.DD") : "-"}
                      </Caption>
                    </TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openExemptDialog(m)}
                          disabled={isPending}
                        >
                          면제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 비활성 설정 다이얼로그 */}
      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDeactivateDialogOpen(false);
            setDeactivateReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비활성 설정 ({activeSelectedMembers.length}명)</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>비활성화 사유</Label>
              <Input
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="예: 장기 미참여, 자진 탈퇴 요청 등"
              />
            </div>
            <Button
              onClick={handleDeactivate}
              disabled={isPending || !deactivateReason.trim()}
              variant="destructive"
            >
              {isPending ? <LoadingSpinner /> : "비활성 설정"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 면제 등록 다이얼로그 */}
      <Dialog open={!!exemptTarget} onOpenChange={(o) => !o && closeExemptDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{exemptTarget?.mem_nm} 면제 등록</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>면제 유형</Label>
              <Select value={exmForm.exmTpEnm} onValueChange={(v) => setExmForm((f) => ({ ...f, exmTpEnm: v as "full" | "part" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">전액 면제</SelectItem>
                  <SelectItem value="part">부분 면제</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {exmForm.exmTpEnm === "part" && (
              <div className="flex flex-col gap-1.5">
                <Label>면제 금액 (원)</Label>
                <Input type="number" value={exmForm.exmAmt} onChange={(e) => setExmForm((f) => ({ ...f, exmAmt: e.target.value }))} placeholder="2000" />
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label>시작일</Label>
                <Input type="date" value={exmForm.aplySttDt} onChange={(e) => setExmForm((f) => ({ ...f, aplySttDt: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label>종료일</Label>
                <Input type="date" value={exmForm.aplyEndDt} onChange={(e) => setExmForm((f) => ({ ...f, aplyEndDt: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>사유</Label>
              <Input value={exmForm.rsnTxt} onChange={(e) => setExmForm((f) => ({ ...f, rsnTxt: e.target.value }))} placeholder="장기 부상, 타지역 이사 등" />
            </div>
            <Button onClick={handleExemptSubmit} disabled={isPending || !exmForm.rsnTxt}>
              {isPending ? <LoadingSpinner /> : "등록"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 납부 원장 탭 ──────────────────────────────────────────────────────────────

function PayHistTab({ payHists }: { payHists: PayHistRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>납부 원장 ({payHists.length}건)</SectionLabel>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {["이름", "납부일", "금액", "분류", "원본 이름", "상태"].map((h) => (
                <TableHead key={h} className="text-center text-xs whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payHists.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center">
                  <Caption className="text-muted-foreground">납부 내역이 없습니다.</Caption>
                </TableCell>
              </TableRow>
            )}
            {payHists.map((p) => (
              <TableRow key={p.pay_id} className={p.pay_st_cd !== "paid" ? "opacity-50" : ""}>
                <TableCell className="text-center">
                  <Caption className="text-xs font-semibold whitespace-nowrap">{p.mem_nm}</Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs whitespace-nowrap">{dayjs(p.pay_dt).format("YYYY.MM.DD")}</Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs font-semibold whitespace-nowrap text-[var(--success)]">
                    +{p.pay_amt.toLocaleString()}원
                  </Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs whitespace-nowrap">{p.fee_item_cd ?? "-"}</Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs whitespace-nowrap">{p.raw_name}</Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={p.pay_st_cd === "paid" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {p.pay_st_cd === "paid" ? "납부" : "취소"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── 메인 클라이언트 컴포넌트 ──────────────────────────────────────────────────

export function DuesTransactionsClient({
  txns,
  uploads,
  members,
  memberRows,
  payHists,
  feeItemCds,
  initialTxnFilter = "unconfirmed",
  initialBalFilter = "all",
  initialTab = "upload",
}: {
  txns: Txn[];
  uploads: Upload[];
  members: Member[];
  memberRows: MemberRow[];
  payHists: PayHistRow[];
  feeItemCds: FeeItemCd[];
  initialTxnFilter?: "all" | "unconfirmed" | "confirmed";
  initialBalFilter?: "all" | "unpaid";
  initialTab?: "upload" | "txn" | "balance" | "pays";
}) {
  const [tab, setTab] = useState<"upload" | "txn" | "balance" | "pays">(initialTab);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
      <SegmentControl
        segments={[
          { value: "upload", label: "업로드" },
          { value: "txn", label: "거래내역" },
          { value: "balance", label: "회원별 잔액" },
          { value: "pays", label: "납부 원장" },
        ]}
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
      />

      {tab === "upload" && (
        <UploadTab uploads={uploads} isPending={isPending} startTransition={startTransition} />
      )}
      {tab === "txn" && (
        <TransactionsTab
          txns={txns}
          members={members}
          feeItemCds={feeItemCds}
          initialFilter={initialTxnFilter}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
      {tab === "balance" && (
        <BalanceTab
          members={memberRows}
          initialFilter={initialBalFilter}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
      {tab === "pays" && <PayHistTab payHists={payHists} />}
    </div>
  );
}
