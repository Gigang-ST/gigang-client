"use client";

import { useState, useTransition } from "react";

import { Pencil, Trash2, Plus, Check, X, ChevronUp, ChevronDown } from "lucide-react";

import { addFeeItem, updateFeeItem, deleteFeeItem, reorderFeeItems } from "@/app/actions/dues/manage-fee-items";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export type FeeItem = {
  cd_id: string;
  cd: string;
  cd_nm: string;
  sort_ord: number;
  is_default_yn: boolean;
};

/**
 * 거래 분류 항목(FEE_ITEM_CD) 관리 UI.
 * 회비 정책 화면과 업로드 화면에서 공용으로 사용한다.
 */
export function FeeItemManager({ feeItems: initialFeeItems }: { feeItems: FeeItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [feeItems, setFeeItems] = useState<FeeItem[]>(initialFeeItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ cd: "", cdNm: "" });

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
    <div className="flex flex-col gap-2">
      <SectionLabel>거래 분류 항목 관리</SectionLabel>
      <Caption className="text-muted-foreground">입금·출금 거래에 붙는 분류 태그를 관리합니다.</Caption>

      {feeItems.map((item, idx) => (
        <CardItem key={item.cd_id} className="flex items-center justify-between gap-2 px-3 py-2">
          {editingId === item.cd_id ? (
            <>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdate(item.cd_id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleUpdate(item.cd_id)} disabled={isPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2 min-w-0">
                <Body className="font-semibold truncate">{item.cd_nm}</Body>
                <Caption className="text-muted-foreground shrink-0">{item.cd}</Caption>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveItem(idx, "up")} disabled={isPending || idx === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveItem(idx, "down")} disabled={isPending || idx === feeItems.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(item)} disabled={isPending}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!item.is_default_yn && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(item.cd_id, item.cd_nm)} disabled={isPending}>
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
            <Input placeholder="예: member_fee" value={addForm.cd} onChange={(e) => setAddForm((f) => ({ ...f, cd: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>항목명</Label>
            <Input placeholder="예: 멤버십 회비" value={addForm.cdNm} onChange={(e) => setAddForm((f) => ({ ...f, cdNm: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={isPending}>
              {isPending ? <LoadingSpinner /> : "추가"}
            </Button>
            <Button variant="outline" onClick={() => { setShowAddForm(false); setAddForm({ cd: "", cdNm: "" }); }}>
              취소
            </Button>
          </div>
        </CardItem>
      ) : (
        <Button variant="outline" className="gap-1.5" onClick={() => { setShowAddForm(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          항목 추가
        </Button>
      )}
    </div>
  );
}
