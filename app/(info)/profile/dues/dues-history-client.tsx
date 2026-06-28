"use client";

import { useState, useTransition } from "react";

import { dayjs } from "@/lib/dayjs";
import type { ExemptionResult } from "@/lib/dues/calc-exemption";

import { requestDuesCheck } from "@/app/actions/dues/request-dues-check";

import { DuesQuestCard } from "@/components/profile/dues-quest-card";
import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HistoryItem = {
  id: string;
  date: string;
  category: "due" | "exm" | "other";
  itemLabel: string;
  ioLabel: "입금" | "출금" | "면제" | "취소";
  amt: number;
  cancelled: boolean;
};

type Filter = "all" | "due" | "other";

type QuestData = { ym: string; result: ExemptionResult; maxAttendCnt: number };

type Props = {
  balAmt: number | null;
  lastCalcDt: string | null;
  teamAccount: { bank: string; number: string; holder: string };
  monthlyFeeAmt: number | null;
  quest: QuestData | null;
  items: HistoryItem[];
};

export function DuesHistoryClient({ balAmt, lastCalcDt, teamAccount, monthlyFeeAmt, quest, items }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [isPending, startTransition] = useTransition();
  const [requested, setRequested] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleConfirm() {
    startTransition(async () => {
      const res = await requestDuesCheck();
      setConfirmOpen(false);
      if (res.ok) {
        setRequested(true);
      } else {
        alert(res.message);
      }
    });
  }

  const filtered = items.filter((item) => {
    if (filter === "due") return item.category === "due" || item.category === "exm";
    if (filter === "other") return item.category === "other";
    return true;
  });

  const balColor = balAmt === null ? "text-foreground" : balAmt >= 0 ? "text-green-600" : "text-destructive";

  function formatAmt(item: HistoryItem) {
    if (item.ioLabel === "면제") return `${item.amt.toLocaleString()}원`;
    if (item.ioLabel === "입금") return `+${item.amt.toLocaleString()}원`;
    if (item.ioLabel === "출금") return `-${item.amt.toLocaleString()}원`;
    return `${item.amt.toLocaleString()}원`;
  }

  function amtColor(item: HistoryItem) {
    if (item.cancelled) return "text-muted-foreground";
    if (item.ioLabel === "입금" || item.ioLabel === "면제") return "text-green-600";
    if (item.ioLabel === "출금") return "text-destructive";
    return "text-muted-foreground";
  }

  function formatDate(dateStr: string) {
    return dayjs(dateStr).format("YY.MM.DD");
  }

  const FILTERS: { value: Filter; label: string }[] = [
    { value: "all", label: "전체" },
    { value: "due", label: "회비" },
    { value: "other", label: "기타" },
  ];

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      {/* 회비 안내 */}
      {monthlyFeeAmt !== null && (
        <div className="flex flex-col gap-0.5">
          <Caption className="font-medium text-foreground">월 회비 {monthlyFeeAmt.toLocaleString()}원</Caption>
          <Caption className="text-muted-foreground">입금 시 입금자명을 정확한 본명으로 입력해 주세요.</Caption>
        </div>
      )}

      {/* 잔액 카드 */}
      <CardItem className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <Caption>현재 잔액</Caption>
          {lastCalcDt && <Caption className="text-muted-foreground">{lastCalcDt} 기준</Caption>}
        </div>
        <div className="flex items-center justify-between">
          <Body className={`text-2xl font-bold ${balColor}`}>
            {balAmt === null ? "-" : `${balAmt >= 0 ? "+" : ""}${balAmt.toLocaleString()}원`}
          </Body>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || requested}
            onClick={() => setConfirmOpen(true)}
          >
            {requested ? "문의 완료" : "문의하기"}
          </Button>
        </div>

        <Separator className="my-1" />

        {/* 모임 계좌 */}
        <div className="flex flex-col items-center gap-0.5 rounded-xl bg-muted px-4 py-3">
          <Caption className="text-muted-foreground mb-1">모임 계좌</Caption>
          <Body className="font-bold">{teamAccount.bank}</Body>
          <Body className="font-mono text-lg font-bold tracking-wide">{teamAccount.number}</Body>
          <Caption className="mt-0.5">{teamAccount.holder}</Caption>
        </div>
      </CardItem>

      {/* 출석 감면 퀘스트 (당월 실시간) */}
      {quest && (
        <DuesQuestCard ym={quest.ym} result={quest.result} maxAttendCnt={quest.maxAttendCnt} />
      )}

      {/* 내역 */}
      <div className="flex flex-col gap-3">
        {/* 헤더 + 필터 */}
        <div className="flex items-center justify-between">
          <SectionLabel>내역</SectionLabel>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  filter === f.value
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 내역 테이블 */}
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-border py-8">
            <Caption>내역이 없습니다.</Caption>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {["날짜", "항목", "구분", "금액"].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap text-center text-xs">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id} className={item.cancelled ? "opacity-50" : ""}>
                    <TableCell className="whitespace-nowrap text-center">
                      <Caption>{formatDate(item.date)}</Caption>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Caption className={item.cancelled ? "line-through" : ""}>{item.itemLabel}</Caption>
                        {item.cancelled && (
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">취소</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Caption
                        className={
                          item.cancelled
                            ? ""
                            : item.ioLabel === "입금" || item.ioLabel === "면제"
                              ? "text-green-600"
                              : item.ioLabel === "출금"
                                ? "text-destructive"
                                : ""
                        }
                      >
                        {item.ioLabel}
                      </Caption>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Caption className={`font-medium ${amtColor(item)} ${item.cancelled ? "line-through" : ""}`}>
                        {formatAmt(item)}
                      </Caption>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 확인 요청 다이얼로그 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회비 문의</DialogTitle>
          </DialogHeader>
          <Caption className="whitespace-pre-line text-muted-foreground">
            {"회비 내역에 문제가 있으신가요?\n관리자에게 확인을 요청합니다."}
          </Caption>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button disabled={isPending} onClick={handleConfirm}>
              {isPending ? "요청 중..." : "요청"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
