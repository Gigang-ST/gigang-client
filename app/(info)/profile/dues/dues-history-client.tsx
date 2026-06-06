"use client";

import { useState } from "react";

import { dayjs } from "@/lib/dayjs";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
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

type Props = {
  balAmt: number | null;
  lastCalcDt: string | null;
  teamAccount: { bank: string; number: string; holder: string };
  items: HistoryItem[];
};

export function DuesHistoryClient({ balAmt, lastCalcDt, teamAccount, items }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

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
      {/* 잔액 카드 */}
      <CardItem className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <Caption>현재 잔액</Caption>
          {lastCalcDt && <Caption className="text-muted-foreground">{lastCalcDt} 기준</Caption>}
        </div>
        <Body className={`text-2xl font-bold ${balColor}`}>
          {balAmt === null ? "-" : `${balAmt >= 0 ? "+" : ""}${balAmt.toLocaleString()}원`}
        </Body>

        <Separator className="my-1" />

        {/* 모임 계좌 */}
        <div className="flex flex-col items-center gap-0.5 rounded-xl bg-muted px-4 py-3">
          <Caption className="text-muted-foreground mb-1">모임 계좌</Caption>
          <Body className="font-bold">{teamAccount.bank}</Body>
          <Body className="font-mono text-lg font-bold tracking-wide">{teamAccount.number}</Body>
          <Caption className="mt-0.5">{teamAccount.holder}</Caption>
        </div>
      </CardItem>

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
                    <TableCell className="whitespace-nowrap">
                      <Caption>{formatDate(item.date)}</Caption>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Caption className={item.cancelled ? "line-through" : ""}>{item.itemLabel}</Caption>
                        {item.cancelled && (
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">취소</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
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
    </div>
  );
}
