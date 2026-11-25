"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { splitAndConfirm } from "@/app/actions/dues/split-transaction";
import {
  carriesProject,
  DECISION_ITEM_LABEL,
  isMemberlessItemCd,
  itemOrderFor,
  type DecisionItemCd,
} from "@/lib/dues/fee-item-direction";
import { MIN_SPLIT_LINES, splitLinesIssue, type SplitLine } from "@/lib/dues/split-lines";
import type { InboxTxn, MemberOption, ProjectOption } from "@/lib/queries/dues";

import { Body, Caption, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { MemberCombobox } from "./member-combobox";

/** 지출(출금)의 프로젝트 귀속은 선택 — 「귀속 안 함」 sentinel */
const NO_PROJECT = "__no_project";

type DraftLine = { amt: string; itemCd: DecisionItemCd; memId: string | null; prjId: string | null };

function emptyLine(io: "deposit" | "withdrawal"): DraftLine {
  return { amt: "", itemCd: itemOrderFor(io)[0], memId: null, prjId: null };
}

function parseAmt(s: string): number {
  const n = Number(s.replaceAll(",", "").trim());
  return s.trim() === "" || !Number.isFinite(n) ? NaN : n;
}

/**
 * 거래 한 건을 금액으로 나눠 넣는 다이얼로그(#754) — 줄마다 금액·분류·대상을 정하고,
 * 합계가 원래 거래 금액과 같을 때만 확정할 수 있다. 검증 규칙은 서버와 같은 `splitLinesIssue`.
 */
export function SplitDialog({
  txn,
  members,
  projects,
  dupNames,
  open,
  onOpenChange,
  onDone,
}: {
  txn: InboxTxn;
  members: MemberOption[];
  projects: ProjectOption[];
  dupNames: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
}) {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    Array.from({ length: MIN_SPLIT_LINES }, () => emptyLine(txn.io)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amts = lines.map((l) => parseAmt(l.amt));
  const sum = amts.reduce<number>((s, a) => s + (Number.isFinite(a) ? a : 0), 0);
  const remain = txn.amt - sum;

  const payload: SplitLine[] = lines.map((l, i) => ({
    amt: amts[i],
    feeItemCd: l.itemCd,
    memId: isMemberlessItemCd(l.itemCd) ? null : l.memId,
    prjId: carriesProject(l.itemCd) ? l.prjId : null,
  }));
  const issue = splitLinesIssue(txn.io, txn.amt, payload);

  function patch(i: number, p: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await splitAndConfirm({ txnId: txn.txnId, lines: payload });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onOpenChange(false);
      onDone(`${txn.rawName} ${txn.amt.toLocaleString()}원을 ${lines.length}줄로 나눠 확정했습니다.`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>나눠 넣기</DialogTitle>
          <DialogDescription>
            {txn.rawName} · {txn.amt.toLocaleString()}원 — 줄마다 금액과 분류를 정하세요. 합계가 거래 금액과 같아야 확정할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Micro className="w-6 text-muted-foreground">{i + 1}</Micro>
                <Input
                  inputMode="numeric"
                  value={l.amt}
                  onChange={(e) => patch(i, { amt: e.target.value })}
                  placeholder="금액"
                  aria-label={`${i + 1}번째 줄 금액`}
                  className="h-8 w-28 text-right"
                />
                <Micro>원</Micro>
                {remain !== 0 && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const cur = Number.isFinite(amts[i]) ? amts[i] : 0;
                      patch(i, { amt: String(cur + remain) });
                    }}
                  >
                    남은 금액 넣기
                  </Button>
                )}
                <Select
                  value={l.itemCd}
                  onValueChange={(v) => patch(i, { itemCd: v as DecisionItemCd, prjId: null })}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {itemOrderFor(txn.io).map((cd) => (
                      <SelectItem key={cd} value={cd}>
                        {DECISION_ITEM_LABEL[cd]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lines.length > MIN_SPLIT_LINES && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`${i + 1}번째 줄 삭제`}
                    className="ml-auto text-muted-foreground"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              {(!isMemberlessItemCd(l.itemCd) || carriesProject(l.itemCd)) && (
                <div className="flex flex-wrap items-center gap-2 pl-8">
                  {!isMemberlessItemCd(l.itemCd) && (
                    <MemberCombobox
                      members={members}
                      value={l.memId}
                      dupNames={dupNames}
                      onSelect={(memId) => patch(i, { memId })}
                    />
                  )}
                  {carriesProject(l.itemCd) && (
                    <Select
                      value={l.prjId ?? (l.itemCd === "expense" ? NO_PROJECT : "")}
                      onValueChange={(v) => patch(i, { prjId: v === NO_PROJECT ? null : v })}
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue placeholder="프로젝트…" />
                      </SelectTrigger>
                      <SelectContent>
                        {l.itemCd === "expense" && <SelectItem value={NO_PROJECT}>귀속 안 함</SelectItem>}
                        {projects.length === 0 && (
                          <SelectItem value="__none" disabled>
                            모금 중인 프로젝트 없음
                          </SelectItem>
                        )}
                        {projects.map((p) => (
                          <SelectItem key={p.prjId} value={p.prjId}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, emptyLine(txn.io)])}
            >
              <Plus className="size-3.5" /> 줄 추가
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
          <Caption>
            합계 {sum.toLocaleString()}원 / {txn.amt.toLocaleString()}원
          </Caption>
          <Body className={remain === 0 ? "font-semibold text-success" : "font-semibold text-warning"}>
            {remain === 0 ? "금액 일치" : remain > 0 ? `${remain.toLocaleString()}원 남음` : `${(-remain).toLocaleString()}원 초과`}
          </Body>
        </div>
        {issue && remain === 0 && <Caption className="text-warning">{issue}</Caption>}
        {error && <Caption className="text-destructive">{error}</Caption>}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            돌아가기
          </Button>
          <Button type="button" disabled={pending || issue !== null} onClick={submit}>
            {pending ? "처리 중…" : "나눠서 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
