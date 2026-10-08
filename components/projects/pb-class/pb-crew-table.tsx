import { Check } from "lucide-react";

import type { PbStripState } from "@/lib/pb-class";
import type { PbCrewAttd, PbCrewColumn, PbCrewRow } from "@/lib/pb-class-chart";
import { cn } from "@/lib/utils";

import { Caption, Micro } from "@/components/common/typography";

/**
 * 출석표 — 참가자 × 회차 점 격자. 「누가 언제 나왔나」를 이름으로 답하는 쪽이다(그래프는 흐름을 답한다).
 *
 * 360px 에서도 13열을 세우려고 칸을 16px(측정 22px)로 잡고 칸 안엔 10px 네모 하나만 둔다 — 회차 띠처럼
 * 글자·날짜를 넣으면 열이 버티지 못한다. 상태 어휘는 띠와 같다(출석 = primary 칠, 결석 = 회색).
 * 다만 **아직 안 열린 칸은 비워 둔다**: 40명 × 7칸의 점선 네모가 깔리면 지나간 회차가 묻힌다.
 * 합류 전은 네모가 아니라 짧은 선이다 — 결석(회색 네모)과 모양부터 달라야 「안 센 칸」으로 읽힌다.
 * 취소된 회차는 칸이 아니라 **열 전체**에 옅은 띠를 깐다(그 회차는 누구에게나 없었다).
 *
 * 표가 길어지면(40명 ≈ 1,000px) 머리줄이 사라져 몇 주차인지 놓치므로 머리줄을 화면 위에 붙인다.
 * 붙이려면 바깥 상자가 스크롤 컨테이너가 되면 안 돼서 `overflow-hidden` 대신 `overflow-clip`이다.
 */

/**
 * 열 폭(px) — 이름 칸은 남는 폭을 다 가진다. 측정은 「측정」 두 글자가 들어갈 만큼.
 * 기준은 375px 이 아니라 **360px**(갤럭시 기본 폭)이다: 본문 312px 에서 이름 칸이 세 글자(약 40px)를
 * 지키려면 고정 열 합이 246px 을 넘으면 안 된다. 16 × 12 + 22 + 32 = 246.
 */
const COL_W = { sess: 16, measure: 22, cnt: 32 } as const;

/** 취소 열의 띠. 머리줄이 붙은 채 스크롤되므로 반투명이 아니라 섞은 불투명 색이다(아래 행이 비치지 않게) */
const CANCELED_BAND = "bg-[color-mix(in_oklab,var(--muted)_75%,var(--card))]";

const SR_LABEL: Record<PbStripState, string> = {
  attended: "출석",
  missed: "결석",
  upcoming: "예정",
  unlinked: "미정",
  canceled: "취소",
  before_join: "합류 전",
};

function Mark({ state }: { state: PbStripState }) {
  if (state === "attended") return <span aria-hidden className="mx-auto block size-2.5 rounded-[3px] bg-primary" />;
  if (state === "missed") return <span aria-hidden className="mx-auto block size-2.5 rounded-[3px] bg-muted-foreground/20" />;
  if (state === "before_join") return <span aria-hidden className="mx-auto block h-px w-2 bg-muted-foreground/40" />;
  return null;
}

function colWidth(col: PbCrewColumn): number {
  return col.tick === "측정" ? COL_W.measure : COL_W.sess;
}

function Row({ row, columns }: { row: PbCrewRow; columns: PbCrewColumn[] }) {
  return (
    <tr className={cn(row.isMe && "bg-primary/5")}>
      <th
        scope="row"
        className={cn("h-7 py-0 pl-2.5 pr-0.5 text-left font-normal", row.isMe && "border-b border-border")}
      >
        <Caption
          title={row.memNm}
          className={cn("block truncate text-foreground", row.isMe && "font-semibold text-primary")}
        >
          {row.memNm}
        </Caption>
        {row.isMe && <span className="sr-only">(나)</span>}
      </th>
      {columns.map((col, i) => (
        <td
          key={col.tick}
          className={cn(
            "p-0 text-center",
            col.state === "canceled" && CANCELED_BAND,
            row.isMe && "border-b border-border",
          )}
        >
          <Mark state={row.cells[i]} />
          <span className="sr-only">
            {col.label} {SR_LABEL[row.cells[i]]}
          </span>
        </td>
      ))}
      <td className={cn("pr-2 text-right", row.isMe && "border-b border-border")}>
        <Caption
          className={cn(
            "flex items-center justify-end gap-px tabular-nums",
            row.full ? "font-semibold text-success" : "text-foreground",
          )}
        >
          {row.full && <Check aria-hidden className="size-2" strokeWidth={4} />}
          {row.attdCnt}
        </Caption>
        {row.full && <span className="sr-only">회 · 전액 확보</span>}
        {!row.full && <span className="sr-only">회</span>}
      </td>
    </tr>
  );
}

const LEGEND: { key: string; mark: PbStripState | "canceled_col"; label: string }[] = [
  { key: "a", mark: "attended", label: "출석" },
  { key: "m", mark: "missed", label: "결석" },
  { key: "b", mark: "before_join", label: "합류 전" },
  { key: "c", mark: "canceled_col", label: "취소된 회차" },
];

export function PbCrewTable({ crew }: { crew: PbCrewAttd }) {
  const { columns, rows } = crew;
  const hasCanceled = columns.some((c) => c.state === "canceled");
  const hasMid = rows.some((r) => r.cells.includes("before_join"));
  const hasFull = rows.some((r) => r.full);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-clip rounded-2xl border border-border bg-card">
        <table
          aria-label="참가자별 회차 출석"
          className="w-full table-fixed border-separate border-spacing-0 leading-none"
        >
          <colgroup>
            <col />
            {columns.map((c) => (
              <col key={c.tick} style={{ width: colWidth(c) }} />
            ))}
            <col style={{ width: COL_W.cnt }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th scope="col" className="border-b border-border bg-card py-2.5 pl-2.5 text-left font-normal">
                <Micro>이름</Micro>
              </th>
              {columns.map((c) => (
                <th
                  key={c.tick}
                  scope="col"
                  className={cn(
                    "border-b border-border px-0 py-2.5 font-normal",
                    c.state === "canceled" ? CANCELED_BAND : "bg-card",
                  )}
                >
                  <Micro
                    aria-hidden
                    className={cn(
                      "block whitespace-nowrap text-center tabular-nums",
                      c.state === "held" ? "text-foreground" : "opacity-50",
                      c.state === "canceled" && "line-through",
                    )}
                  >
                    {c.tick}
                  </Micro>
                  <span className="sr-only">{c.label}</span>
                </th>
              ))}
              <th scope="col" className="border-b border-border bg-card py-2.5 pr-2 text-right font-normal">
                <Micro>출석</Micro>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.memId} row={row} columns={columns} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="border-t border-border py-2.5 pl-2.5 text-left font-normal">
                <Micro className="whitespace-nowrap">인원</Micro>
              </th>
              {columns.map((c) => (
                <td
                  key={c.tick}
                  className={cn(
                    "border-t border-border px-0 py-2.5 text-center",
                    c.state === "canceled" && CANCELED_BAND,
                  )}
                >
                  {c.attdCnt !== null && (
                    <Micro className="font-medium tabular-nums tracking-tight text-foreground">{c.attdCnt}</Micro>
                  )}
                </td>
              ))}
              <td className="border-t border-border" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {LEGEND.filter(
          (l) => (l.mark !== "canceled_col" || hasCanceled) && (l.mark !== "before_join" || hasMid),
        ).map((l) => (
          <span key={l.key} className="flex items-center gap-1">
            {l.mark === "canceled_col" ? (
              <span aria-hidden className={cn("h-3 w-2.5 rounded-[2px]", CANCELED_BAND)} />
            ) : (
              <span aria-hidden className="flex w-2.5 items-center">
                <Mark state={l.mark} />
              </span>
            )}
            <Micro>{l.label}</Micro>
          </span>
        ))}
        {hasFull && (
          <span className="flex items-center gap-1">
            <Check aria-hidden className="size-2.5 text-success" strokeWidth={3.5} />
            <Micro>전액 확보</Micro>
          </span>
        )}
      </div>
    </div>
  );
}
