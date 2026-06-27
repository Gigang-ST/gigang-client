"use client";

import { useState, useTransition } from "react";

import dayjs from "dayjs";

import { updatePolicy } from "@/app/actions/dues/update-policy";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { FeeItem, FeeItemManager } from "@/app/(info)/admin/dues/fee-item-manager";

type Policy = {
  fee_policy_id: string;
  aply_stt_dt: string;
  aply_end_dt: string;
  monthly_fee_amt: number;
};

export function DuesPolicyClient({
  policies,
  feeItems,
}: {
  policies: Policy[];
  feeItems: FeeItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    aplySttDt: dayjs().format("YYYY-MM-DD"),
    aplyEndDt: "2099-12-31",
    monthlyFeeAmt: "2000",
  });

  function handlePolicySubmit() {
    startTransition(async () => {
      const res = await updatePolicy({
        aplySttDt: policyForm.aplySttDt,
        aplyEndDt: policyForm.aplyEndDt,
        monthlyFeeAmt: Number(policyForm.monthlyFeeAmt),
      });
      if (res.ok) {
        setShowPolicyForm(false);
        window.location.reload();
      } else {
        alert(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8 px-6 pb-6 pt-2">
      {/* 회비 정책 섹션 */}
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

        {!showPolicyForm ? (
          <Button variant="outline" onClick={() => setShowPolicyForm(true)}>새 정책 추가</Button>
        ) : (
          <CardItem className="flex flex-col gap-4 p-4">
            <SectionLabel>새 정책 추가</SectionLabel>
            <div className="flex gap-2">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label>시작일</Label>
                <Input
                  type="date"
                  value={policyForm.aplySttDt}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, aplySttDt: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label>종료일</Label>
                <Input
                  type="date"
                  value={policyForm.aplyEndDt}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, aplyEndDt: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>월 회비 (원)</Label>
              <Input
                type="number"
                value={policyForm.monthlyFeeAmt}
                onChange={(e) => setPolicyForm((f) => ({ ...f, monthlyFeeAmt: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePolicySubmit} disabled={isPending}>
                {isPending ? <LoadingSpinner /> : "저장"}
              </Button>
              <Button variant="outline" onClick={() => setShowPolicyForm(false)}>취소</Button>
            </div>
          </CardItem>
        )}
      </div>

      {/* 입금항목 섹션 — 공용 컴포넌트 (업로드 화면과 공유) */}
      <FeeItemManager feeItems={feeItems} />
    </div>
  );
}
