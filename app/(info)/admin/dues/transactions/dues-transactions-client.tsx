"use client";

import { Dispatch, SetStateAction, useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Calculator, Check, ChevronsUpDown, ListFilter, Plus, RotateCcw, Search, UserMinus } from "lucide-react";

import { dayjs } from "@/lib/dayjs";

import { batchDeactivateMembers } from "@/app/actions/admin/manage-member";
import { addManualTransaction } from "@/app/actions/dues/add-manual-transaction";
import { cancelTransaction } from "@/app/actions/dues/cancel-transaction";
import { confirmTransactions } from "@/app/actions/dues/confirm-transactions";
import { deleteTransaction } from "@/app/actions/dues/delete-transaction";
import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";
import { rollbackSnapshot } from "@/app/actions/dues/rollback-snapshot";
import { rollbackXlsx } from "@/app/actions/dues/rollback-xlsx";
import { uploadXlsx } from "@/app/actions/dues/upload-xlsx";

import { SegmentControl } from "@/components/common/segment-control";
import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { FeeItem, FeeItemManager } from "@/app/(info)/admin/dues/fee-item-manager";

type Txn = {
  txn_id: string;
  txn_dt: string;
  txn_tm: string | null;
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

function MemberSearchInput({
  value,
  onChange,
  placeholder = "이름 검색",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pl-8 text-xs w-32"
      />
    </div>
  );
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

// ─── 회원 자동완성 콤보박스 ────────────────────────────────────────────────────

function MemberCombobox({
  members,
  value,
  currentName,
  onSelect,
  disabled,
}: {
  members: Member[];
  value: string | null;
  currentName?: string | null;
  onSelect: (memId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = members.find((m) => m.mem_id === value);
  const label = selected?.mem_nm ?? currentName ?? "회원 선택";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-7 w-28 justify-between px-2 text-xs font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-0">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="이름 검색" className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>검색 결과 없음</CommandEmpty>
            <CommandGroup>
              {members.map((m) => {
                // value(검색대상)에 이름+생년월일을 포함시켜 동명이인도 타이핑으로 좁힐 수 있게
                const searchValue = `${m.mem_nm} ${m.birth_dt ?? ""} ${m.join_dt ?? ""}`;
                return (
                  <CommandItem
                    key={m.mem_id}
                    value={searchValue}
                    onSelect={() => { onSelect(m.mem_id); setOpen(false); }}
                    className="text-xs"
                  >
                    <Check className={`mr-2 size-3 ${value === m.mem_id ? "opacity-100" : "opacity-0"}`} />
                    <span className="text-foreground">{m.mem_nm}</span>
                    <span className="ml-2 text-muted-foreground">
                      {m.birth_dt ? dayjs(m.birth_dt).format("YY.MM.DD") : (m.join_dt ? `가입 ${dayjs(m.join_dt).format("YY.MM.DD")}` : "")}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── 업로드 탭 ─────────────────────────────────────────────────────────────────

function UploadTab({
  uploads,
  feeItemsFull,
  isPending,
  startTransition,
}: {
  uploads: Upload[];
  feeItemsFull: FeeItem[];
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const router = useRouter();
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null);
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
        // 업로드 성공 → 거래내역 탭으로 이동 (새 거래를 바로 확정 처리하도록).
        // 요약은 sessionStorage 로 넘겨 거래내역 화면 상단에 표시.
        // 등록건수 = 총건수 − 중복제외 − 마감이전제외 (실제 거래내역에 적재된 수)
        const s = res.summary;
        const registered = s.total - s.skipped - s.skippedByCutoff;
        const summary = `업로드 완료 — 총 ${s.total}건 중 ${registered}건 등록 (매칭 ${s.matched} · 미매칭 ${s.unmatched} · 동명이인 ${s.ambiguous} / 중복 제외 ${s.skipped} · 마감이전 제외 ${s.skippedByCutoff})`;
        try { sessionStorage.setItem("dues_upload_summary", summary); } catch {}
        window.location.href = "/admin/dues/transactions?tab=txn";
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
        setRollbackMsg(`롤백 완료 — "${res.fileNm}" 업로드 취소, 거래 ${res.deletedCount}건 삭제`);
        setUploadMsg(null);
        router.refresh(); // 업로드 이력 목록만 갱신 (전체 새로고침 X)
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
              <Body className="text-muted-foreground">파일 선택 (xlsx)</Body>
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
        {rollbackMsg && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2">
            <Caption className="text-warning">{rollbackMsg}</Caption>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setRollbackMsg(null)} aria-label="닫기">
              ✕
            </button>
          </div>
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

      {/* 거래 분류 항목 관리 (정책 화면과 공유) */}
      <FeeItemManager feeItems={feeItemsFull} />
    </div>
  );
}

// ─── 거래내역 탭 ───────────────────────────────────────────────────────────────

type SortKey = "txn_dt" | "raw_name" | "fee_item_cd" | "match" | "cfm" | "reflect";

/**
 * 거래의 반영 상태를 단일 값으로 계산. 정렬·필터·배지에서 공용 사용.
 *
 *  - none        : 미확정
 *  - unreflected : 회비(due)인데 미매칭으로 확정 → 누구 건지 확인 못 함(개인잔액 불가). UI에선 "확인불가"
 *  - pending     : 회비+매칭 확정인데 재계산(recalculateBalance) 전 → 개인잔액 미반영 상태
 *  - reflected   : 반영 완료. 비회비는 확정 즉시 입금현황 반영되므로 항상 여기 해당.
 *
 * 재계산은 "회원 개인잔액"만 다시 계산하므로, 비회비 거래는 재계산 대상이 아니다.
 * → 비회비는 is_stale 과 무관하게 확정 즉시 reflected.
 */
function reflectState(t: Txn): "none" | "reflected" | "pending" | "unreflected" {
  if (!t.is_cfm_yn) return "none";
  if (t.fee_item_cd !== "due") return "reflected"; // 비회비: 확정 즉시 입금현황 반영
  // 이하 회비(due)
  if (t.match_st_cd !== "matched") return "unreflected"; // 회비 미매칭: 개인잔액 무관
  return t.is_stale ? "pending" : "reflected"; // 회비+매칭: 재계산 여부에 따라
}

/**
 * 헤더 셀 안에 들어가는 다중선택 필터 팝오버.
 * - 정렬용 라벨 텍스트와 별개로, ▾ 아이콘을 눌러 체크박스 목록으로 거른다.
 * - selected 가 빈 Set 이면 "전체" (필터 미적용).
 */
function HeaderFilter({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const active = selected.size > 0;
  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="필터"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center justify-center rounded p-0.5 align-middle ${
            active ? "text-primary" : "text-muted-foreground/60 hover:text-foreground"
          }`}
        >
          <ListFilter className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-36 p-1">
        <div className="flex flex-col">
          {active && (
            <button
              type="button"
              className="px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted rounded"
              onClick={() => onChange(new Set())}
            >
              전체 보기
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted rounded"
            >
              <Checkbox checked={selected.has(opt.value)} onCheckedChange={() => toggle(opt.value)} />
              <span className="text-foreground">{opt.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TransactionsTab({
  txns,
  setTxns,
  members,
  feeItemCds,
  isPending,
  startTransition,
}: {
  txns: Txn[];
  setTxns: Dispatch<SetStateAction<Txn[]>>;
  members: Member[];
  feeItemCds: FeeItemCd[];
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  // 헤더 팝오버 필터 — 빈 Set = 전체 허용. 확정 필터는 기본 미적용(전체 표시).
  const [cfmFilter, setCfmFilter] = useState<Set<string>>(new Set());
  const [feeFilter, setFeeFilter] = useState<Set<string>>(new Set());
  const [matchFilterSet, setMatchFilterSet] = useState<Set<string>>(new Set());
  const [reflectFilter, setReflectFilter] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 로컬에서 분류/매칭을 바꾼 거래 추적 — 확정 시 함께 서버로 전송 (A 방식).
  // value = { feeItemCd?, memId? } 중 바뀐 것만 담김
  const [dirty, setDirty] = useState<Map<string, { feeItemCd?: string; memId?: string }>>(new Map());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("txn_dt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // 업로드 직후 거래내역으로 넘어온 경우 요약 표시 (sessionStorage 로 전달됨).
  // SSR 과 클라이언트 첫 렌더를 동일(null)하게 두고, 마운트 후에만 읽어
  // 하이드레이션 불일치를 피한다.
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("dues_upload_summary");
      if (s) {
        sessionStorage.removeItem("dues_upload_summary");
        // 브라우저 전용 데이터를 마운트 후 1회 읽어오는 정당한 패턴 (빈 deps).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUploadSummary(s);
      }
    } catch {
      // sessionStorage 접근 불가 환경은 무시
    }
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "txn_dt" ? "desc" : "asc"); }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const q = memberQuery.trim().toLowerCase();
  const filtered = txns.filter((t) => {
    if (cfmFilter.size > 0 && !cfmFilter.has(t.is_cfm_yn ? "confirmed" : "unconfirmed")) return false;
    if (feeFilter.size > 0 && !feeFilter.has(t.fee_item_cd ?? "")) return false;
    if (matchFilterSet.size > 0 && !matchFilterSet.has(t.match_st_cd)) return false;
    if (reflectFilter.size > 0 && !reflectFilter.has(reflectState(t))) return false;
    if (q) {
      const memNm = getMemNm(t.mem_mst);
      if (!memNm?.toLowerCase().includes(q) && !t.raw_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const matchOrder: Record<string, number> = { matched: 0, ambiguous: 1, unmatched: 2 };
  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortKey === "txn_dt") { av = `${a.txn_dt}T${a.txn_tm ?? ""}`; bv = `${b.txn_dt}T${b.txn_tm ?? ""}`; }
    else if (sortKey === "raw_name") { av = getMemNm(a.mem_mst) ?? a.raw_name; bv = getMemNm(b.mem_mst) ?? b.raw_name; }
    else if (sortKey === "fee_item_cd") { av = a.fee_item_cd ?? ""; bv = b.fee_item_cd ?? ""; }
    else if (sortKey === "match") { av = matchOrder[a.match_st_cd] ?? 9; bv = matchOrder[b.match_st_cd] ?? 9; }
    else if (sortKey === "cfm") { av = a.is_cfm_yn ? 1 : 0; bv = b.is_cfm_yn ? 1 : 0; }
    else if (sortKey === "reflect") {
      const order: Record<string, number> = { none: 0, unreflected: 1, pending: 2, reflected: 3 };
      av = order[reflectState(a)]; bv = order[reflectState(b)];
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  // 선택 확정: 선택된 것 중 미확정 + 분류 있음 (회비 미매칭도 사용자가 명시 선택했으면 포함 — 미반영으로 확정)
  const confirmableSelected = sorted.filter(
    (t) => selected.has(t.txn_id) && !t.is_cfm_yn && !!t.fee_item_cd
  );
  // 일괄 확정: 바로 잔액 반영 가능한 것만 자동 (비회비 또는 회비+매칭). 회비 미매칭은 제외해 실수 방지.
  const confirmableAll = sorted.filter(
    (t) => !t.is_cfm_yn && !!t.fee_item_cd && (t.fee_item_cd !== "due" || t.match_st_cd === "matched")
  );
  const staleMemIds = [...new Set(txns.filter((t) => t.is_stale && t.mem_id).map((t) => t.mem_id!))];

  const allFilteredIds = sorted.map((t) => t.txn_id);
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

  // 확정 — 옵티미스틱: 즉시 UI 반영 후 백그라운드 전송. 로컬 분류/매칭 변경분(dirty)을 함께 보냄.
  function bulkConfirm(targets: Txn[], clearSelection: boolean) {
    if (targets.length === 0) return;
    const ids = targets.map((t) => t.txn_id);
    const idSet = new Set(ids);
    const items = targets.map((t) => {
      const d = dirty.get(t.txn_id);
      return { txnId: t.txn_id, feeItemCd: d?.feeItemCd, memId: d?.memId };
    });

    // 옵티미스틱: 화면 먼저 확정 처리
    const prevTxns = txns;
    setTxns((prev) => prev.map((tx) => (idSet.has(tx.txn_id) ? { ...tx, is_cfm_yn: true, is_stale: true } : tx)));
    if (clearSelection) setSelected(new Set());
    setDirty((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });

    startTransition(async () => {
      const res = await confirmTransactions(items);
      if (!res.ok) {
        setTxns(prevTxns); // 실패 시 롤백
        alert(res.message);
      }
    });
  }

  function handleBulkConfirm() {
    bulkConfirm(confirmableSelected, true);
  }

  function handleBulkConfirmAll() {
    bulkConfirm(confirmableAll, false);
  }

  function handleToggleConfirm(t: Txn) {
    if (t.is_cfm_yn) {
      handleCancel(t.txn_id);
      return;
    }
    if (!t.fee_item_cd) {
      alert("분류를 먼저 선택해 주세요.");
      return;
    }
    if (t.fee_item_cd === "due" && t.match_st_cd !== "matched") {
      if (!confirm("회원 매칭이 안 된 회비 거래입니다.\n확정해도 누구 입금인지 확인이 안 돼 개인 잔액에는 반영되지 않고 '확인불가'로 남습니다.\n계속하시겠습니까?")) return;
    }
    bulkConfirm([t], false);
  }

  // 매칭 변경 — 로컬만(A 방식). 확정 시 confirmTransactions 가 함께 반영.
  function handleMatch(txnId: string, memId: string) {
    const mem = members.find((m) => m.mem_id === memId);
    setTxns((prev) =>
      prev.map((t) =>
        t.txn_id === txnId
          ? { ...t, match_st_cd: "matched", mem_id: memId, mem_mst: mem ? { mem_nm: mem.mem_nm } : t.mem_mst }
          : t,
      ),
    );
    setDirty((prev) => {
      const next = new Map(prev);
      next.set(txnId, { ...next.get(txnId), memId });
      return next;
    });
  }

  // 분류 변경 — 로컬만(A 방식). 확정 시 함께 저장되어 별도 서버 왕복이 없다.
  function handleFeeItem(txnId: string, val: string) {
    setTxns((prev) => prev.map((t) => (t.txn_id === txnId ? { ...t, fee_item_cd: val } : t)));
    setDirty((prev) => {
      const next = new Map(prev);
      next.set(txnId, { ...next.get(txnId), feeItemCd: val });
      return next;
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
          prev.map((t) => (t.txn_id === txnId ? { ...t, is_cfm_yn: false, is_stale: false } : t))
        );
      } else if ("needsRollback" in res && res.needsRollback) {
        alert(`${res.message}\n\n회원별 잔액 탭 > 해당 회원 선택 > Snapshot Rollback 버튼을 먼저 실행하세요.`);
      } else {
        alert(res.message);
      }
    });
  }

  function handleDelete(txnId: string) {
    if (!confirm("이 거래를 제외하시겠습니까?\n제외한 거래(날짜·시간·금액·이름이 동일)는 이후 어떤 엑셀로 업로드해도 다시 들어오지 않습니다.")) return;
    startTransition(async () => {
      const res = await deleteTransaction(txnId);
      if (res.ok) {
        setTxns((prev) => prev.filter((t) => t.txn_id !== txnId));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(txnId);
          return next;
        });
      } else {
        alert(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {uploadSummary && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <Caption className="text-primary">{uploadSummary}</Caption>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setUploadSummary(null)} aria-label="닫기">
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <MemberSearchInput value={memberQuery} onChange={setMemberQuery} />
        {(cfmFilter.size > 0 || feeFilter.size > 0 || matchFilterSet.size > 0 || reflectFilter.size > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => { setCfmFilter(new Set()); setFeeFilter(new Set()); setMatchFilterSet(new Set()); setReflectFilter(new Set()); }}
          >
            필터 초기화
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)} disabled={isPending}>
          <Plus className="size-3.5 mr-1" />
          직접 추가
        </Button>
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
          <SectionLabel>거래 내역 ({sorted.length}건)</SectionLabel>
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
              선택 확정 ({confirmableSelected.length})
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
                  <TableHead
                    className="whitespace-nowrap text-center text-xs cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort("txn_dt")}
                  >
                    일시{sortIndicator("txn_dt")}
                  </TableHead>
                  <TableHead
                    className="whitespace-nowrap text-center text-xs cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort("raw_name")}
                  >
                    이름{sortIndicator("raw_name")}
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">매칭이름</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("match")}>
                        매칭여부{sortIndicator("match")}
                      </span>
                      <HeaderFilter
                        options={[
                          { value: "matched", label: "매칭" },
                          { value: "ambiguous", label: "동명이인" },
                          { value: "unmatched", label: "미매칭" },
                        ]}
                        selected={matchFilterSet}
                        onChange={setMatchFilterSet}
                      />
                    </span>
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("fee_item_cd")}>
                        분류{sortIndicator("fee_item_cd")}
                      </span>
                      <HeaderFilter
                        options={feeItemCds.map((f) => ({ value: f.cd, label: f.label }))}
                        selected={feeFilter}
                        onChange={setFeeFilter}
                      />
                    </span>
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">금액</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("cfm")}>
                        확정{sortIndicator("cfm")}
                      </span>
                      <HeaderFilter
                        options={[
                          { value: "confirmed", label: "확정" },
                          { value: "unconfirmed", label: "미확정" },
                        ]}
                        selected={cfmFilter}
                        onChange={setCfmFilter}
                      />
                    </span>
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("reflect")}>
                        반영여부{sortIndicator("reflect")}
                      </span>
                      <HeaderFilter
                        options={[
                          { value: "reflected", label: "반영" },
                          { value: "pending", label: "계산대기" },
                          { value: "unreflected", label: "확인불가" },
                          { value: "none", label: "미확정" },
                        ]}
                        selected={reflectFilter}
                        onChange={setReflectFilter}
                      />
                    </span>
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center text-xs">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center">
                      <Caption className="text-muted-foreground">해당 내역이 없습니다. (필터를 확인하세요)</Caption>
                    </TableCell>
                  </TableRow>
                )}
                {sorted.map((t) => {
                  const memNm = getMemNm(t.mem_mst);
                  const feeLabel = feeItemCds.find((f) => f.cd === t.fee_item_cd)?.label ?? t.fee_item_cd ?? "-";
                  const isDeposit = t.txn_io_enm === "deposit";
                  // 확정 게이트: 분류만 있으면 확정 가능. (회비 미매칭도 확정 OK — 개인잔액엔 미반영으로 남음)
                  const canConfirm = !!t.fee_item_cd;
                  return (
                    <TableRow
                      key={t.txn_id}
                      className={t.is_cfm_yn ? "bg-muted/30" : ""}
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
                        <div className="flex flex-col items-center leading-tight">
                          <Caption className="whitespace-nowrap text-xs text-foreground">
                            {dayjs(t.txn_dt).format("YY.MM.DD")}
                          </Caption>
                          {t.txn_tm && (
                            <Caption className="whitespace-nowrap text-[10px] text-muted-foreground">
                              {dayjs(`${t.txn_dt}T${t.txn_tm}`).format("HH:mm")}
                            </Caption>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Caption className="whitespace-nowrap text-xs text-foreground">{t.raw_name}</Caption>
                      </TableCell>
                      <TableCell className="text-center">
                        {t.is_cfm_yn ? (
                          <Caption className="whitespace-nowrap text-xs text-foreground">{memNm ?? "-"}</Caption>
                        ) : (
                          <div className="flex justify-center">
                            <MemberCombobox
                              members={members}
                              value={t.mem_id}
                              currentName={memNm}
                              onSelect={(memId) => handleMatch(t.txn_id, memId)}
                              disabled={isPending}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
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
                      </TableCell>
                      <TableCell className="text-center">
                        {t.is_cfm_yn ? (
                          <Caption className="text-xs text-foreground">{feeLabel}</Caption>
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
                        <button
                          type="button"
                          role="switch"
                          aria-checked={t.is_cfm_yn}
                          aria-label="확정 토글"
                          disabled={isPending || (!t.is_cfm_yn && !canConfirm)}
                          onClick={() => handleToggleConfirm(t)}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            t.is_cfm_yn ? "bg-primary" : "bg-muted-foreground/30"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              t.is_cfm_yn ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const rs = reflectState(t);
                          if (rs === "none") return <Caption className="text-xs text-muted-foreground">-</Caption>;
                          if (rs === "pending") return <Badge variant="outline" className="text-xs text-warning border-warning">계산대기</Badge>;
                          if (rs === "reflected") return <Badge variant="outline" className="text-xs text-[var(--success)] border-[var(--success)]">반영</Badge>;
                          return <Badge variant="outline" className="text-xs text-destructive border-destructive">확인불가</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {!t.is_cfm_yn && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive"
                            onClick={() => handleDelete(t.txn_id)}
                            disabled={isPending}
                          >
                            제외
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </div>
      </div>

      <AddTransactionDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        members={members}
        feeItemCds={feeItemCds}
        isPending={isPending}
        startTransition={startTransition}
        onAdded={(txn) => setTxns((prev) => [txn, ...prev])}
      />
    </div>
  );
}

// ─── 거래 직접 추가 다이얼로그 ─────────────────────────────────────────────────

function AddTransactionDialog({
  open,
  onClose,
  members,
  feeItemCds,
  isPending,
  startTransition,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  feeItemCds: FeeItemCd[];
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  onAdded: (txn: Txn) => void;
}) {
  const [txnDt, setTxnDt] = useState(() => dayjs().tz("Asia/Seoul").format("YYYY-MM-DD"));
  const [txnIo, setTxnIo] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [rawName, setRawName] = useState("");
  const [feeItemCd, setFeeItemCd] = useState(feeItemCds[0]?.cd ?? "due");
  const [memId, setMemId] = useState<string | null>(null);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMem = members.find((m) => m.mem_id === memId);

  function reset() {
    setTxnDt(dayjs().tz("Asia/Seoul").format("YYYY-MM-DD"));
    setTxnIo("deposit");
    setAmount("");
    setRawName("");
    setFeeItemCd(feeItemCds[0]?.cd ?? "due");
    setMemId(null);
    setError(null);
  }

  function handleSubmit() {
    const amt = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(amt) || amt <= 0) { setError("금액을 올바르게 입력해 주세요."); return; }
    if (!rawName.trim()) { setError("이름(적요)을 입력해 주세요."); return; }
    setError(null);
    startTransition(async () => {
      const res = await addManualTransaction({
        txnDt,
        txnIo,
        amount: amt,
        rawName: rawName.trim(),
        feeItemCd,
        memId,
      });
      if (res.ok) {
        onAdded(res.txn as Txn);
        reset();
        onClose();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>거래 직접 추가</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">거래일자</Label>
            <Input type="date" value={txnDt} onChange={(e) => setTxnDt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">입출금</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={txnIo === "deposit" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setTxnIo("deposit")}
              >
                입금 (+)
              </Button>
              <Button
                type="button"
                variant={txnIo === "withdrawal" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setTxnIo("withdrawal")}
              >
                출금 (−)
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">금액 (양수)</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="예: 200000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">이름 (적요)</Label>
            <Input value={rawName} onChange={(e) => setRawName(e.target.value)} placeholder="예: 잔액 보정" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">분류</Label>
            <Select value={feeItemCd} onValueChange={setFeeItemCd}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {feeItemCds.map((item) => (
                  <SelectItem key={item.cd} value={item.cd}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">회원 (선택 — 없으면 기록만)</Label>
            <div className="flex items-center gap-2">
              <Caption className="text-xs text-foreground">{selectedMem ? selectedMem.mem_nm : "미지정"}</Caption>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setMemberSearchOpen(true)}>
                {selectedMem ? "변경" : "회원 선택"}
              </Button>
              {selectedMem && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setMemId(null)}>
                  해제
                </Button>
              )}
            </div>
          </div>
          {error && <Caption className="text-destructive">{error}</Caption>}
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <LoadingSpinner /> : "추가"}
          </Button>
        </div>
      </DialogContent>

      <MemberSearchDialog
        open={memberSearchOpen}
        onClose={() => setMemberSearchOpen(false)}
        members={members}
        onSelect={(id) => { setMemId(id); setMemberSearchOpen(false); }}
      />
    </Dialog>
  );
}

// ─── 회원별 잔액 탭 ────────────────────────────────────────────────────────────

function BalanceTab({
  members,
  initialFilter,
  isPending,
  startTransition,
  unconfirmedCount,
}: {
  members: MemberRow[];
  initialFilter: "all" | "unpaid";
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  unconfirmedCount: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unpaid">(initialFilter);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");

  const [memberQuery, setMemberQuery] = useState("");
  const [sortKey, setSortKey] = useState<"mem_nm" | "join_dt" | "bal_amt" | "last_calc_dt" | "last_calc_at">("mem_nm");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showInactive, setShowInactive] = useState(false);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortIndicator(key: typeof sortKey) {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const mq = memberQuery.trim().toLowerCase();
  const activeFilteredMembers = showInactive ? members : members.filter((m) => m.mem_st_cd !== "inactive");
  const unpaidMembers = activeFilteredMembers.filter((m) => m.snap && m.snap.bal_amt < 0);
  const baseMembers = (filter === "unpaid" ? unpaidMembers : activeFilteredMembers).filter(
    (m) => !mq || m.mem_nm.toLowerCase().includes(mq)
  );

  const displayedMembers = [...baseMembers].sort((a, b) => {
    let av: string | number | null = null;
    let bv: string | number | null = null;
    if (sortKey === "mem_nm") { av = a.mem_nm; bv = b.mem_nm; }
    else if (sortKey === "join_dt") { av = a.join_dt; bv = b.join_dt; }
    else if (sortKey === "bal_amt") { av = a.snap?.bal_amt ?? null; bv = b.snap?.bal_amt ?? null; }
    else if (sortKey === "last_calc_dt") { av = a.snap?.last_calc_dt ?? null; bv = b.snap?.last_calc_dt ?? null; }
    else if (sortKey === "last_calc_at") { av = a.snap?.last_calc_at ?? null; bv = b.snap?.last_calc_at ?? null; }
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

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
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={(v) => setShowInactive(!!v)}
          />
          <Label htmlFor="show-inactive" className="text-xs text-muted-foreground cursor-pointer select-none">
            비활성 포함
          </Label>
        </div>
        <MemberSearchInput value={memberQuery} onChange={setMemberQuery} />
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
        <Button
          size="sm"
          className="bg-warning text-white hover:bg-warning/90"
          onClick={() => {
            if (unconfirmedCount > 0) {
              alert(`미확정 거래가 ${unconfirmedCount}건 있습니다.\n거래내역 탭에서 모두 확정 처리 후 재계산하세요.`);
              return;
            }
            if (!confirm("⚠️ 거래내역 최신화 후 계산하시기 바랍니다.\n계속하시겠습니까?")) return;
            startTransition(async () => {
              const res = await recalculateBalance();
              if (!res.ok) { alert(res.message); return; }
              alert(`전체 계산 완료 (${res.updatedCount}명)`);
              router.refresh();
            });
          }}
          disabled={isPending}
        >
          <Calculator className="size-3.5 mr-1" />
          전체 회비 계산
        </Button>
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
        <SectionLabel>회원별 잔액 ({displayedMembers.length}명{filter === "unpaid" ? " · 미납 필터" : ""}{!showInactive ? " · 비활성 제외" : ""})</SectionLabel>
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
                <TableHead
                  className="text-center text-xs whitespace-nowrap cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort("mem_nm")}
                >
                  이름{sortIndicator("mem_nm")}
                </TableHead>
                <TableHead className="text-center text-xs whitespace-nowrap">생년월일</TableHead>
                <TableHead
                  className="text-center text-xs whitespace-nowrap cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort("join_dt")}
                >
                  가입일{sortIndicator("join_dt")}
                </TableHead>
                <TableHead
                  className="text-center text-xs whitespace-nowrap cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort("bal_amt")}
                >
                  잔액{sortIndicator("bal_amt")}
                </TableHead>
                <TableHead
                  className="text-center text-xs whitespace-nowrap cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort("last_calc_dt")}
                >
                  기준일{sortIndicator("last_calc_dt")}
                </TableHead>
                <TableHead
                  className="text-center text-xs whitespace-nowrap cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort("last_calc_at")}
                >
                  마지막거래일{sortIndicator("last_calc_at")}
                </TableHead>
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
                        {m.snap?.last_calc_dt ? dayjs(m.snap.last_calc_dt).format("YYYY.MM.DD HH:mm") : "-"}
                      </Caption>
                    </TableCell>
                    <TableCell className="text-center">
                      <Caption className="text-xs whitespace-nowrap">
                        {m.snap?.last_calc_at ? dayjs(m.snap.last_calc_at).tz("Asia/Seoul").format("YYYY.MM.DD HH:mm") : "-"}
                      </Caption>
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

    </div>
  );
}

// ─── 납부 원장 탭 ──────────────────────────────────────────────────────────────

function PayHistTab({ payHists }: { payHists: PayHistRow[] }) {
  const [memberQuery, setMemberQuery] = useState("");

  const q = memberQuery.trim().toLowerCase();
  const filtered = q ? payHists.filter((p) => p.mem_nm.toLowerCase().includes(q)) : payHists;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SectionLabel>납부 원장 ({filtered.length}건)</SectionLabel>
        <MemberSearchInput value={memberQuery} onChange={setMemberQuery} />
      </div>
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
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center">
                  <Caption className="text-muted-foreground">납부 내역이 없습니다.</Caption>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) => (
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
  txns: initialTxns,
  uploads,
  members,
  memberRows,
  payHists,
  feeItemCds,
  feeItemsFull,
  initialBalFilter = "all",
  initialTab = "upload",
}: {
  txns: Txn[];
  uploads: Upload[];
  members: Member[];
  memberRows: MemberRow[];
  payHists: PayHistRow[];
  feeItemCds: FeeItemCd[];
  feeItemsFull: FeeItem[];
  initialBalFilter?: "all" | "unpaid";
  initialTab?: "upload" | "txn" | "balance" | "pays";
}) {
  const [tab, setTab] = useState<"upload" | "txn" | "balance" | "pays">(initialTab);
  const [isPending, startTransition] = useTransition();
  const [txns, setTxns] = useState(initialTxns);

  const unconfirmedCount = txns.filter((t) => !t.is_cfm_yn).length;

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
        <UploadTab uploads={uploads} feeItemsFull={feeItemsFull} isPending={isPending} startTransition={startTransition} />
      )}
      {tab === "txn" && (
        <TransactionsTab
          txns={txns}
          setTxns={setTxns}
          members={members}
          feeItemCds={feeItemCds}
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
          unconfirmedCount={unconfirmedCount}
        />
      )}
      {tab === "pays" && <PayHistTab payHists={payHists} />}
    </div>
  );
}
