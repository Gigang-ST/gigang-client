"use client";

import { useState, useTransition } from "react";
import dayjs from "dayjs";
import { Pencil, Trash2, Plus, Check, X, ChevronUp, ChevronDown } from "lucide-react";

import { updatePolicy } from "@/app/actions/dues/update-policy";
import { addFeeItem, updateFeeItem, deleteFeeItem, reorderFeeItems } from "@/app/actions/dues/manage-fee-items";

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

type FeeItem = {
  cd_id: string;
  cd: string;
  cd_nm: string;
  sort_ord: number;
  is_default_yn: boolean;
};

export function DuesPolicyClient({
  policies,
  feeItems: initialFeeItems,
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

  // 입금항목 상태
  const [feeItems, setFeeItems] = useState<FeeItem[]>(initialFeeItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ cd: "", cdNm: "" });

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

  function moveItem(idx: number, direction: "up" | "down") {
    const newItems = [...feeItems];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
    const reordered = newItems.map((item, i) => ({ ...item, sort_ord: i + 1 }));
    setFeeItems(reordered);
    startTransition(async () => {
      await reorderFeeItems(reordered.map((item) => ({ cdId: item.cd_id, sortOrd: item.sort_ord })));
    });
  }

  function startEdit(item: FeeItem) {
    setEditingId(item.cd_id);
    setEditName(item.cd_nm);
    setShowAddForm(false);
  }

  function handleUpdate(cdId: string) {
    startTransition(async () => {
      const res = await updateFeeItem({ cdId, cdNm: editName });
      if (res.ok) {
        setFeeItems((prev) => prev.map((i) => (i.cd_id === cdId ? { ...i, cd_nm: editName } : i)));
        setEditingId(null);
      } else {
        alert(res.message);
      }
    });
  }

  function handleDelete(cdId: string, cdNm: string) {
    if (!confirm(`"${cdNm}" 항목을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const res = await deleteFeeItem(cdId);
      if (res.ok) {
        setFeeItems((prev) => prev.filter((i) => i.cd_id !== cdId));
      } else {
        alert(res.message);
      }
    });
  }

  function handleAdd() {
    startTransition(async () => {
      const nextSortOrd = feeItems.length > 0 ? Math.max(...feeItems.map((i) => i.sort_ord)) + 1 : 1;
      const res = await addFeeItem({ cd: addForm.cd, cdNm: addForm.cdNm, sortOrd: nextSortOrd });
      if (res.ok) {
        setShowAddForm(false);
        setAddForm({ cd: "", cdNm: "" });
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

      {/* 입금항목 섹션 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>거래 분류 항목 관리</SectionLabel>
        <Caption className="text-muted-foreground">입금·출금 거래에 붙는 분류 태그를 관리합니다.</Caption>

        {feeItems.map((item, idx) => (
          <CardItem key={item.cd_id} className="flex items-center justify-between p-4">
            {editingId === item.cd_id ? (
              <>
                <div className="flex flex-col gap-0.5 flex-1 mr-2">
                  <Caption className="text-muted-foreground">{item.cd}</Caption>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(item.cd_id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleUpdate(item.cd_id)}
                    disabled={isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-0.5">
                  <Body className="font-semibold">{item.cd_nm}</Body>
                  <Caption className="text-muted-foreground">{item.cd}</Caption>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => moveItem(idx, "up")}
                    disabled={isPending || idx === 0}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => moveItem(idx, "down")}
                    disabled={isPending || idx === feeItems.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => startEdit(item)}
                    disabled={isPending}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!item.is_default_yn && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item.cd_id, item.cd_nm)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardItem>
        ))}

        {showAddForm ? (
          <CardItem className="flex flex-col gap-3 p-4">
            <SectionLabel>새 항목 추가</SectionLabel>
            <div className="flex flex-col gap-1.5">
              <Label>코드 (영문 소문자·숫자·밑줄)</Label>
              <Input
                placeholder="예: member_fee"
                value={addForm.cd}
                onChange={(e) => setAddForm((f) => ({ ...f, cd: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>항목명</Label>
              <Input
                placeholder="예: 멤버십 회비"
                value={addForm.cdNm}
                onChange={(e) => setAddForm((f) => ({ ...f, cdNm: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={isPending}>
                {isPending ? <LoadingSpinner /> : "추가"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setAddForm({ cd: "", cdNm: "" });
                }}
              >
                취소
              </Button>
            </div>
          </CardItem>
        ) : (
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
            }}
          >
            <Plus className="h-4 w-4" />
            항목 추가
          </Button>
        )}
      </div>
    </div>
  );
}
