"use client";

import { useState, useTransition } from "react";
import { dayjs } from "@/lib/dayjs";

import { confirmTransaction } from "@/app/actions/dues/confirm-transaction";
import { matchTransaction } from "@/app/actions/dues/match-transaction";
import { updateFeeItem } from "@/app/actions/dues/update-fee-item";
import { uploadXlsx } from "@/app/actions/dues/upload-xlsx";
import { rollbackXlsx } from "@/app/actions/dues/rollback-xlsx";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  mem_mst: { mem_nm: string } | { mem_nm: string }[] | null;
};

type Upload = { upd_id: string; file_nm: string; crt_at: string; upd_st_cd: string };
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
  const filtered = members.filter((m) =>
    m.mem_nm.includes(query)
  );

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

export function DuesTransactionsClient({
  teamId,
  txns: initialTxns,
  uploads,
  members,
  feeItemCds,
}: {
  teamId: string;
  txns: Txn[];
  uploads: Upload[];
  members: Member[];
  feeItemCds: FeeItemCd[];
}) {
  const [txns, setTxns] = useState(initialTxns);
  const [filter, setFilter] = useState<"all" | "unconfirmed" | "unmatched">("unmatched");
  const [isPending, startTransition] = useTransition();
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchDialog, setMatchDialog] = useState<string | null>(null); // txn_id

  const filtered = txns.filter((t) => {
    if (filter === "unconfirmed") return !t.is_cfm_yn;
    if (filter === "unmatched") return t.match_st_cd !== "matched";
    return true;
  });

  // 선택 확정 대상: 선택됨 + 미확정 + matched
  const confirmableSelected = filtered.filter(
    (t) => selected.has(t.txn_id) && !t.is_cfm_yn && t.match_st_cd === "matched"
  );
  // 매칭행 일괄 확정 대상: 미확정 + matched 전체 (선택 무관)
  const confirmableAll = filtered.filter(
    (t) => !t.is_cfm_yn && t.match_st_cd === "matched"
  );

  const allFilteredIds = filtered.map((t) => t.txn_id);
  const isAllSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const isIndeterminate =
    !isAllSelected && allFilteredIds.some((id) => selected.has(id));

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
          `업로드 완료 — 총 ${res.summary.total}건, 매칭 ${res.summary.matched}건, 미매칭 ${res.summary.unmatched}건, 동명이인 ${res.summary.ambiguous}건, 중복 skip ${res.summary.skipped}건`
        );
        window.location.reload();
      } else {
        setUploadMsg(res.message);
      }
      setUploading(false);
    });
    e.target.value = "";
  }

  function handleConfirm(txnId: string) {
    startTransition(async () => {
      const res = await confirmTransaction(txnId);
      if (res.ok) {
        setTxns((prev) => prev.map((t) => (t.txn_id === txnId ? { ...t, is_cfm_yn: true } : t)));
      } else {
        alert(res.message);
      }
    });
  }

  async function handleBulkConfirm() {
    for (const t of confirmableSelected) {
      await new Promise<void>((resolve) => {
        startTransition(async () => {
          const res = await confirmTransaction(t.txn_id);
          if (res.ok) {
            setTxns((prev) =>
              prev.map((tx) => (tx.txn_id === t.txn_id ? { ...tx, is_cfm_yn: true } : tx))
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
              prev.map((tx) => (tx.txn_id === t.txn_id ? { ...tx, is_cfm_yn: true } : tx))
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
              ? {
                  ...t,
                  match_st_cd: res.match_st_cd,
                  mem_id: memId,
                  mem_mst: mem ? { mem_nm: mem.mem_nm } : t.mem_mst,
                }
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
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* 엑셀 업로드 */}
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

      {/* 업로드 이력 */}
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

      {/* 필터 */}
      <div className="flex gap-2">
        {(["unmatched", "unconfirmed", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "unmatched" ? "미매칭" : f === "unconfirmed" ? "미확정" : "전체"}
          </Button>
        ))}
      </div>

      {/* 거래 내역 테이블 */}
      <div className="flex flex-col gap-3">
        {/* 테이블 상단: 타이틀 + 일괄 확정 */}
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
                      {/* 체크박스 */}
                      <TableCell>
                        <Checkbox
                          checked={selected.has(t.txn_id)}
                          onCheckedChange={() => toggleRow(t.txn_id)}
                          aria-label="행 선택"
                          disabled={isPending}
                        />
                      </TableCell>

                      {/* 날짜 */}
                      <TableCell className="text-center">
                        <Caption className="whitespace-nowrap text-xs">
                          {dayjs(t.txn_dt).format("YYYY.MM.DD")}
                        </Caption>
                      </TableCell>

                      {/* 원본 이름 */}
                      <TableCell className="text-center">
                        <Caption className="whitespace-nowrap text-xs">{t.raw_name}</Caption>
                      </TableCell>

                      {/* 매칭이름 */}
                      <TableCell className="text-center">
                        {t.match_st_cd === "matched" ? (
                          <Caption className="whitespace-nowrap text-xs">{memNm ?? "-"}</Caption>
                        ) : (
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs whitespace-nowrap"
                              onClick={() => setMatchDialog(t.txn_id)}
                              disabled={isPending || t.is_cfm_yn}
                            >
                              회원 검색
                            </Button>
                          </div>
                        )}
                      </TableCell>

                      {/* 분류 */}
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

                      {/* 금액 */}
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

                      {/* 상태 */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          {t.is_cfm_yn && <Badge variant="secondary" className="text-xs">확정됨</Badge>}
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
