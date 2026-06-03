"use client";

import { useState, useTransition } from "react";
import dayjs from "dayjs";

import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";
import { createExemption } from "@/app/actions/dues/create-exemption";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type MemberRow = {
  mem_id: string;
  mem_nm: string;
  snap: { bal_snap_id: string; bal_amt: number; last_calc_dt: string } | null;
};

export function DuesMembersClient({ teamId, members }: { teamId: string; members: MemberRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [exemptTarget, setExemptTarget] = useState<MemberRow | null>(null);
  const [exmForm, setExmForm] = useState({
    exmTpEnm: "full" as "full" | "part",
    exmAmt: "",
    aplySttDt: dayjs().format("YYYY-MM-DD"),
    aplyEndDt: dayjs().endOf("month").format("YYYY-MM-DD"),
    rsnTxt: "",
  });

  const unpaidMembers = members.filter((m) => m.snap && m.snap.bal_amt < 0);

  function handleRecalcAll() {
    if (!confirm("전체 회원 잔액을 재계산합니다. 계속하시겠습니까?")) return;
    startTransition(async () => {
      const res = await recalculateBalance();
      if (res.ok) {
        alert(`재계산 완료 (${res.updatedCount}명)`);
        window.location.reload();
      } else {
        alert(res.message);
      }
    });
  }

  function handleRecalcOne(memId: string) {
    startTransition(async () => {
      const res = await recalculateBalance(memId);
      if (res.ok) {
        window.location.reload();
      } else {
        alert(res.message);
      }
    });
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

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* 상단 액션 */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleRecalcAll} disabled={isPending}>
          {isPending ? <LoadingSpinner /> : "전체 재계산"}
        </Button>
        {unpaidMembers.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleCopyUnpaid}>
            미납자 복사 ({unpaidMembers.length}명)
          </Button>
        )}
      </div>

      {/* 회원 목록 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>회원별 잔액 ({members.length}명)</SectionLabel>
        {members.map((m) => {
          const bal = m.snap?.bal_amt ?? null;
          return (
            <CardItem key={m.mem_id} className="flex items-center justify-between p-4">
              <div className="flex flex-col gap-1">
                <Body className="font-semibold">{m.mem_nm}</Body>
                {bal === null ? (
                  <Caption>정산 내역 없음</Caption>
                ) : (
                  <Caption className={bal < 0 ? "text-destructive" : bal > 0 ? "text-primary" : ""}>
                    {bal > 0 && "+"}
                    {bal.toLocaleString()}원
                    {m.snap?.last_calc_dt && ` · ${dayjs(m.snap.last_calc_dt).format("MM/DD")} 기준`}
                  </Caption>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleRecalcOne(m.mem_id)} disabled={isPending}>
                  재계산
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setExemptTarget(m)}>
                  면제
                </Button>
              </div>
            </CardItem>
          );
        })}
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
