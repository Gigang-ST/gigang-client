"use client";

import type { KeyboardEvent } from "react";

import { dayjs } from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { memberLabel } from "@/lib/dues/homonyms";
import type { Decision, ItemCd } from "@/lib/dues/confirm-payload";
import type { InboxTxn, MemberOption } from "@/lib/queries/dues";

import { Body, Caption, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MemberCombobox } from "./member-combobox";

export const ITEM_LABEL: Record<ItemCd, string> = { due: "회비", event_fee: "프로젝트", other: "제외" };
export const ITEM_ORDER: ItemCd[] = ["due", "event_fee", "other"];

export function memberNameById(members: MemberOption[]): Map<string, string> {
  return new Map(members.map((m) => [m.memId, m.name]));
}

const BUCKET_BADGE: Record<InboxTxn["bucket"], { label: string; cls: string }> = {
  autoDone: { label: "자동", cls: "bg-success/15 text-success" },
  needsReview: { label: "확인", cls: "bg-warning/15 text-warning" },
  excluded: { label: "제외", cls: "bg-muted text-muted-foreground" },
};

/**
 * 통합 테이블의 행 1건.
 * - editable(needsReview): 분류 Select + 회비면 후보 칩·직접선택 + 기억하기.
 * - 읽기(autoDone/excluded): 저장값을 텍스트로만 표시.
 * 키보드: 행 자체(빈 영역) 포커스 시 1/2/3=분류, ↑/↓=행 이동, Enter=다음.
 * 내부 입력에서의 타이핑은 e.target===e.currentTarget 검사로 가로채지 않는다.
 */
export function InboxRow({
  txn,
  members,
  dupNames,
  nameById,
  decision,
  selected,
  editable,
  onChange,
  onToggleSelect,
  rowRef,
  onArrow,
  onEnterNext,
  onDelete,
  deleteBusy,
}: {
  txn: InboxTxn;
  members: MemberOption[];
  dupNames: Set<string>;
  nameById: Map<string, string>;
  decision: Decision | null;
  selected: boolean;
  editable: boolean;
  onChange: (patch: Partial<Decision>) => void;
  onToggleSelect: (checked: boolean) => void;
  rowRef: (el: HTMLTableRowElement | null) => void;
  onArrow: (dir: -1 | 1) => void;
  onEnterNext: () => void;
  /** 미확정 거래 소프트 삭제(재업로드 재유입 차단) — 잘못 들어온 은행 행 제거용 */
  onDelete: () => void;
  /** 다른 행 삭제 진행 중 — 중복 실행 방지 */
  deleteBusy: boolean;
}) {
  const decided = !editable || (!!decision && (decision.itemCd !== "due" || !!decision.memId));
  const badge = BUCKET_BADGE[txn.bucket];

  function handleKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.target !== e.currentTarget) return;
    if (editable && e.key === "1") { onChange({ itemCd: "due" }); e.preventDefault(); }
    else if (editable && e.key === "2") { onChange({ itemCd: "event_fee" }); e.preventDefault(); }
    else if (editable && e.key === "3") { onChange({ itemCd: "other" }); e.preventDefault(); }
    else if (e.key === "ArrowDown") { onArrow(1); e.preventDefault(); }
    else if (e.key === "ArrowUp") { onArrow(-1); e.preventDefault(); }
    else if (e.key === "Enter") { onEnterNext(); e.preventDefault(); }
  }

  return (
    <tr
      ref={rowRef}
      tabIndex={editable ? 0 : -1}
      onKeyDown={handleKeyDown}
      className={cn(
        "border-b border-border align-top outline-none focus-visible:ring-2 focus-visible:ring-ring",
        editable && !decided && "bg-warning/5",
      )}
    >
      <td className="px-2 py-2">
        {editable ? (
          <Checkbox checked={selected} onCheckedChange={(c) => onToggleSelect(c === true)} />
        ) : null}
      </td>
      <td className="px-2 py-2">
        <Micro>{dayjs(txn.txnDt).format("YY.MM.DD")}</Micro>
      </td>
      <td className="px-2 py-2">
        <Caption className="text-foreground">{txn.rawName}</Caption>
      </td>
      <td className="px-2 py-2 text-right">
        <Body className="font-semibold">{txn.amt.toLocaleString()}원</Body>
      </td>
      <td className="px-2 py-2">
        {!editable ? (
          <Caption className="text-foreground">
            {txn.bucket === "autoDone" && txn.memId ? (nameById.get(txn.memId) ?? "—") : "—"}
          </Caption>
        ) : decision?.itemCd === "due" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {txn.candidates.length === 0 && <Caption>후보 없음</Caption>}
            {txn.candidates.map((c) => (
              <Button
                key={c.memId}
                type="button"
                size="xs"
                variant={decision.memId === c.memId ? "default" : "outline"}
                onClick={() => onChange({ memId: c.memId })}
              >
                {memberLabel(c, dupNames)} {Math.round(c.score * 100)}%
              </Button>
            ))}
            <MemberCombobox
              members={members}
              value={decision.memId}
              dupNames={dupNames}
              onSelect={(memId) => onChange({ memId })}
            />
          </div>
        ) : (
          <Caption>—</Caption>
        )}
      </td>
      <td className="px-2 py-2">
        {editable && decision ? (
          <div className="flex flex-col gap-1.5">
            <Select value={decision.itemCd} onValueChange={(v) => onChange({ itemCd: v as ItemCd })}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_ORDER.map((cd) => (
                  <SelectItem key={cd} value={cd}>
                    {ITEM_LABEL[cd]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {decision.itemCd === "due" && decision.memId && (
              <label className="flex items-center gap-1.5">
                <Checkbox
                  checked={decision.remember}
                  onCheckedChange={(c) => onChange({ remember: c === true })}
                />
                <Micro>이름 기억</Micro>
              </label>
            )}
          </div>
        ) : (
          <Caption className="text-foreground">
            {txn.feeItemCd === "due" ? "회비" : txn.bucket === "excluded" ? "제외" : "프로젝트"}
          </Caption>
        )}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1.5">
          <Badge className={cn("border-0", badge.cls)}>{badge.label}</Badge>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            disabled={deleteBusy}
            onClick={onDelete}
          >
            삭제
          </Button>
        </div>
      </td>
    </tr>
  );
}
