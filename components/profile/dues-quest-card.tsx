import { Check, Square } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import type { ExemptionResult } from "@/lib/dues/calc-exemption";
import { cn } from "@/lib/utils";

import { Body, Caption, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";

type Props = {
  /** 'YYYY-MM' 당월 */
  ym: string;
  /** get_member_monthly_activity(당월) → calcExemption 결과 */
  result: ExemptionResult;
  /** 최종 티어 참석 임계값(진행 바 만점 기준). 예: 8 */
  maxAttendCnt: number;
};

/**
 * 출석 회비 감면 퀘스트 카드 — 당월 실시간 진행도(설계 §7.1).
 * 면제 row 는 월 마감 배치 때 생기지만, 이 카드가 실시간 집계로 "달성 여부 + 예상 감면"을 즉시 보여준다.
 */
export function DuesQuestCard({ ym, result, maxAttendCnt }: Props) {
  const { gatePassed, gateDetail, attendCnt, exmAmt, nextTier } = result;
  const monthLabel = dayjs(`${ym}-01`).format("M월");
  const progressRatio = Math.min(attendCnt / maxAttendCnt, 1);

  return (
    <CardItem className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <Body className="font-semibold">이번 달 출석 감면</Body>
        <Caption className="text-muted-foreground">{monthLabel}</Caption>
      </div>

      {/* ① 게이트: 정모 참석 OR 벙 개설 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {gatePassed ? (
            <Check className="text-success h-4 w-4 shrink-0" />
          ) : (
            <Square className="text-muted-foreground h-4 w-4 shrink-0" />
          )}
          <Caption className={cn(gatePassed ? "text-foreground font-medium" : "text-muted-foreground")}>
            ① 정모 참석 또는 벙 개설
          </Caption>
          <Caption className={cn("ml-auto", gatePassed ? "text-success font-medium" : "text-muted-foreground")}>
            {gatePassed ? "달성" : "미충족"}
          </Caption>
        </div>
        <Micro className="text-muted-foreground pl-5">
          정모 {gateDetail.regularAttend} · 개설 {gateDetail.hosted}
          {!gatePassed && " — 정모 1회 참석 또는 벙 1회 개설 필요"}
        </Micro>
      </div>

      {/* ② 참석 횟수 진행 바 (게이트 미충족 시 회색 비활성) */}
      <div className={cn("flex flex-col gap-1.5", !gatePassed && "opacity-50")}>
        <div className="flex items-center justify-between">
          <Caption className={cn(gatePassed ? "text-foreground" : "text-muted-foreground")}>
            ② 참석 {attendCnt}/{maxAttendCnt}
          </Caption>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className={cn("h-full rounded-full transition-all", gatePassed ? "bg-success" : "bg-muted-foreground/40")}
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
        {!gatePassed && (
          <Micro className="text-muted-foreground">①을 먼저 달성해야 감면이 적용돼요</Micro>
        )}
      </div>

      {/* 현재 감면액 + 다음 티어 안내 */}
      <div className="border-border flex items-center justify-between border-t pt-3">
        <Caption className="text-muted-foreground">현재 감면 (마감 후 반영)</Caption>
        <Body className={cn("font-bold", exmAmt > 0 ? "text-success" : "text-muted-foreground")}>
          {exmAmt.toLocaleString()}원
        </Body>
      </div>
      {nextTier && gatePassed && (
        <Micro className="text-muted-foreground -mt-1.5 text-right">
          {nextTier.remaining}회 더 참석하면 {nextTier.exmAmt.toLocaleString()}원 감면
        </Micro>
      )}
      {!nextTier && gatePassed && exmAmt > 0 && (
        <Micro className="text-success -mt-1.5 text-right">최대 감면 달성! 🎉</Micro>
      )}
    </CardItem>
  );
}
