"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addManualTransaction } from "@/app/actions/dues/add-manual-transaction";
import { dayjs } from "@/lib/dayjs";
import type { FeeItemOption, MemberOption } from "@/lib/queries/dues";

import { Caption, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MemberCombobox } from "./member-combobox";

/**
 * 은행 내역에 없는 거래(현금 납부·보정 등)를 직접 등록하는 다이얼로그.
 * 등록되면 미확정 상태로 인박스에 들어와 일반 거래와 같은 확정 흐름을 탄다.
 * 분류는 인박스 triage 3종이 아니라 FEE_ITEM_CD 전체(지출·물품·커스텀 포함)를 받는다 —
 * 수동 등록은 지출 보정 같은 비회비 건이 많다.
 */
export function ManualTxnButton({
  members,
  dupNames,
  feeItems,
}: {
  members: MemberOption[];
  dupNames: Set<string>;
  feeItems: FeeItemOption[];
}) {
  const [open, setOpen] = useState(false);
  const [txnDt, setTxnDt] = useState(() => dayjs().tz("Asia/Seoul").format("YYYY-MM-DD"));
  const [io, setIo] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [rawName, setRawName] = useState("");
  const [itemCd, setItemCd] = useState<string>("due");
  const [memId, setMemId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit() {
    setErr(null);
    startTransition(async () => {
      const res = await addManualTransaction({
        txnDt,
        txnIo: io,
        amount: Number(amount),
        rawName,
        feeItemCd: itemCd,
        memId,
        memo: memo || null,
      });
      if (res.ok) {
        setOpen(false);
        setAmount("");
        setRawName("");
        setMemId(null);
        setMemo("");
        router.refresh();
      } else {
        setErr(res.message);
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        수동 등록
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>거래 수동 등록</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Micro className="text-muted-foreground">
              은행 내역에 없는 거래(현금 납부·보정)용 — 등록 후 인박스에서 확정해야 잔액에 반영됩니다.
            </Micro>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manual-dt">거래일자</Label>
                <Input id="manual-dt" type="date" value={txnDt} onChange={(e) => setTxnDt(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>입출금</Label>
                <Select value={io} onValueChange={(v) => setIo(v as "deposit" | "withdrawal")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">입금</SelectItem>
                    <SelectItem value="withdrawal">출금</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manual-amt">금액</Label>
                <Input
                  id="manual-amt"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="2000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>분류</Label>
                <Select value={itemCd} onValueChange={setItemCd}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {feeItems.map((f) => (
                      <SelectItem key={f.cd} value={f.cd}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-name">이름(적요)</Label>
              <Input
                id="manual-name"
                placeholder="홍길동 현금납부"
                value={rawName}
                onChange={(e) => setRawName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>회원 매칭 (선택)</Label>
              <MemberCombobox members={members} value={memId} dupNames={dupNames} onSelect={setMemId} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-memo">메모 (선택)</Label>
              <Input id="manual-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            {err && <Caption className="text-destructive">{err}</Caption>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button type="button" disabled={pending || !amount || !rawName.trim()} onClick={onSubmit}>
              {pending ? "등록 중…" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
