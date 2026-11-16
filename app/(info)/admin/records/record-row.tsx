"use client";

import { Body, Micro } from "@/components/common/typography";
import { dayjs, secondsToTime as formatTime } from "@/lib/dayjs";

import type { AdminRecordRow, RecordIssue } from "./records-view";

/**
 * 목록 한 줄(약 56px) — 1행 이름·이상 배지·기록, 2행 종목·대회명·대회일. 줄 전체가 버튼이라 누르면 상세가 열린다.
 * 기록은 오른쪽 끝에 맞춰 세로로 줄을 맞춘다(훑어볼 때 숫자 열이 하나로 읽히게).
 */
export function RecordRow({
  record,
  issues,
  onSelect,
}: {
  record: AdminRecordRow;
  issues: readonly RecordIssue[] | undefined;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors active:bg-secondary md:hover:bg-secondary/60"
    >
      <span className="flex w-full items-center gap-2">
        <Body className="min-w-0 truncate font-semibold">{record.memNm ?? "이름 없음"}</Body>
        {issues?.map((i) => (
          <IssueBadge key={i.kind} issue={i} />
        ))}
        <Body className="ml-auto shrink-0 font-semibold tabular-nums">{formatTime(record.recordTimeSec)}</Body>
      </span>
      <span className="flex w-full items-center gap-2">
        <Micro className="min-w-0 truncate">
          <span className="font-medium text-foreground/80">{record.eventLabel}</span>
          {record.raceName && ` · ${record.raceName}`}
        </Micro>
        <Micro className="ml-auto shrink-0 tabular-nums">
          {record.raceDate ? dayjs(record.raceDate).format("YY.MM.DD") : "-"}
        </Micro>
      </span>
    </button>
  );
}

export function IssueBadge({ issue }: { issue: RecordIssue }) {
  return (
    <span className="shrink-0 rounded border border-warning/50 px-1 text-[11px] font-medium leading-4 text-warning">
      {issue.label}
    </span>
  );
}
