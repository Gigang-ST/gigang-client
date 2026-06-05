"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayjs } from "@/lib/dayjs";

import { createExemption } from "@/app/actions/dues/create-exemption";

import { Caption, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MemberRow = {
  mem_id: string;
  mem_nm: string;
  birth_dt: string | null;
  join_dt: string | null;
  snap: { bal_snap_id: string; bal_amt: number; last_calc_dt: string; last_calc_at: string | null } | null;
  is_stale: boolean;
};

export function DuesMembersClient({ members, initialFilter = "all" }: { teamId?: string; members: MemberRow[]; initialFilter?: "all" | "unpaid" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "unpaid">(initialFilter);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exemptTarget, setExemptTarget] = useState<MemberRow | null>(null);
  const [exmForm, setExmForm] = useState({
    exmTpEnm: "full" as "full" | "part",
    exmAmt: "",
    aplySttDt: dayjs().format("YYYY-MM-DD"),
    aplyEndDt: dayjs().endOf("month").format("YYYY-MM-DD"),
    rsnTxt: "",
  });

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

  function handleCopyUnpaid() {
    const names = unpaidMembers.map((m) => m.mem_nm).join(", ");
    navigator.clipboard.writeText(names);
    alert("클립보드에 복사했습니다.");
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
        setExemptTarget(null);
        alert("면제 규칙이 등록되었습니다.");
      } else {
        alert(res.message);
      }
    });
  }

  const displayedIds = displayedMembers.map((m) => m.mem_id);
  const isAllSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedIds.has(id));
  const isIndeterminate = !isAllSelected && displayedIds.some((id) => selectedIds.has(id));

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* 상단 액션 */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filter === "unpaid" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter((f) => f === "unpaid" ? "all" : "unpaid")}
        >
          미납 {unpaidMembers.length}명
        </Button>
        {unpaidMembers.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleCopyUnpaid}>
            미납자 복사
          </Button>
        )}
        {selectedIds.size > 0 && (
          <Button size="sm" onClick={handleSendNoti}>
            알림 전송 ({selectedIds.size}명)
          </Button>
        )}
      </div>

      {/* 회원별 잔액 그리드 */}
      <div className="flex flex-col gap-3">
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
                    className={isChecked ? "bg-muted/40" : ""}
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
                      <Caption className="text-xs font-semibold whitespace-nowrap">{m.mem_nm}</Caption>
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
                          onClick={() => setExemptTarget(m)}
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

      {/* 면제 등록 다이얼로그 */}
      <Dialog open={!!exemptTarget} onOpenChange={(o) => !o && setExemptTarget(null)}>
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
