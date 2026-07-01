"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { H2, Body, Caption, SectionLabel } from "@/components/common/typography";
import { SegmentControl } from "@/components/common/segment-control";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";

import type { LedgerRow } from "@/lib/queries/dues";

type Filter = "all" | "unpaid" | "prepaid";

/**
 * 회비 잔액 원장 랜딩 화면. 회원별 잔액 요약(미납/정상/예치) + 필터 + 이름 검색 + 회원 행을 보여준다.
 * 행 액션의 "면제"는 기존 면제 관리 화면(/admin/dues/exemptions)으로, 상단 "정책"은
 * 기존 정책 화면(/admin/dues/policy)으로 연결한다(폼 로직 중복 작성 방지).
 * "독려"/"미납자 전체 푸시"는 P3에서 활성화 예정이라 현재는 비활성 버튼으로만 노출한다.
 */
export function LedgerClient({
  rows,
  summary,
}: {
  rows: LedgerRow[];
  summary: { unpaid: number; ok: number; prepaid: number };
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === "unpaid" && r.status !== "미납") return false;
        if (filter === "prepaid" && r.status !== "예치") return false;
        if (q && !r.name.includes(q)) return false;
        return true;
      }),
    [rows, filter, q],
  );

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
      <div className="flex items-center justify-between">
        <H2>회비 현황</H2>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/dues/policy">정책</Link>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Caption>
          미납 <span className="font-semibold text-destructive">{summary.unpaid}</span>
        </Caption>
        <Caption>
          정상 <span className="font-semibold text-foreground">{summary.ok}</span>
        </Caption>
        <Caption>
          예치 <span className="font-semibold text-success">{summary.prepaid}</span>
        </Caption>
      </div>

      <SegmentControl
        segments={[
          { value: "all", label: "전체" },
          { value: "unpaid", label: "미납만" },
          { value: "prepaid", label: "예치만" },
        ]}
        value={filter}
        onValueChange={(v) => setFilter(v as Filter)}
      />

      <Input placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="flex items-center justify-between pt-2">
        <SectionLabel>회원 목록 ({shown.length})</SectionLabel>
        <Button size="sm" variant="outline" disabled title="P3 예정">
          미납자 전체 푸시
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState variant="card" message="조건에 맞는 회원이 없습니다." />
      ) : (
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          {shown.map((r) => (
            <div key={r.memId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <Body className="font-semibold">{r.name}</Body>
                <Caption>
                  {r.balance < 0 ? `${r.months}개월 미납` : r.balance > 0 ? `${r.months}개월 예치` : "정상"}
                </Caption>
              </div>
              <div className="flex items-center gap-2">
                <Body
                  className={cn(
                    "font-semibold whitespace-nowrap",
                    r.balance < 0 && "text-destructive",
                    r.balance > 0 && "text-success",
                  )}
                >
                  {r.balance > 0 ? "+" : ""}
                  {r.balance.toLocaleString()}원
                </Body>
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/dues/exemptions">면제</Link>
                </Button>
                <Button size="sm" variant="outline" disabled title="P3 예정">
                  독려
                </Button>
              </div>
            </div>
          ))}
        </CardItem>
      )}
    </div>
  );
}
