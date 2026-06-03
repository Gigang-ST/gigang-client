"use client";

import { useState, useTransition } from "react";
import dayjs from "dayjs";

import { updatePolicy } from "@/app/actions/dues/update-policy";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type Policy = {
  fee_policy_id: string;
  aply_stt_dt: string;
  aply_end_dt: string;
  monthly_fee_amt: number;
};

export function DuesPolicyClient({ policies }: { policies: Policy[] }) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    aplySttDt: dayjs().format("YYYY-MM-DD"),
    aplyEndDt: "2099-12-31",
    monthlyFeeAmt: "2000",
  });

  function handleSubmit() {
    startTransition(async () => {
      const res = await updatePolicy({
        aplySttDt: form.aplySttDt,
        aplyEndDt: form.aplyEndDt,
        monthlyFeeAmt: Number(form.monthlyFeeAmt),
      });
      if (res.ok) {
        setShowForm(false);
        window.location.reload();
      } else {
        alert(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      <div className="flex flex-col gap-2">
        <SectionLabel>회비 정책 목록</SectionLabel>
        {policies.length === 0 && <Caption className="text-muted-foreground">등록된 정책이 없습니다.</Caption>}
        {policies.map((p) => (
          <CardItem key={p.fee_policy_id} className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-0.5">
              <Body className="font-semibold">{p.monthly_fee_amt.toLocaleString()}원 / 월</Body>
              <Caption>
                {dayjs(p.aply_stt_dt).format("YYYY.MM.DD")} ~{" "}
                {p.aply_end_dt === "2099-12-31" ? "무기한" : dayjs(p.aply_end_dt).format("YYYY.MM.DD")}
              </Caption>
            </div>
          </CardItem>
        ))}
      </div>

      {!showForm ? (
        <Button variant="outline" onClick={() => setShowForm(true)}>새 정책 추가</Button>
      ) : (
        <CardItem className="flex flex-col gap-4 p-4">
          <SectionLabel>새 정책 추가</SectionLabel>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>시작일</Label>
              <Input type="date" value={form.aplySttDt} onChange={(e) => setForm((f) => ({ ...f, aplySttDt: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>종료일</Label>
              <Input type="date" value={form.aplyEndDt} onChange={(e) => setForm((f) => ({ ...f, aplyEndDt: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>월 회비 (원)</Label>
            <Input type="number" value={form.monthlyFeeAmt} onChange={(e) => setForm((f) => ({ ...f, monthlyFeeAmt: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? <LoadingSpinner /> : "저장"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>취소</Button>
          </div>
        </CardItem>
      )}
    </div>
  );
}
