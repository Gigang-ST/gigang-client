import { Check, X } from "lucide-react";

import { buildSessStrip, type PbClassCfg, type PbStripCell, type PbStripState } from "@/lib/pb-class";
import { formatKST } from "@/lib/dayjs";
import type { PbParticipant, PbSession } from "@/lib/queries/pb-class";
import { cn } from "@/lib/utils";

import { SectionHeader } from "@/components/common/section-header";
import { Micro } from "@/components/common/typography";

/** 칸 상태별 모양 — 색은 토큰만 쓴다. 상태는 색만으로 구분하지 않고 글리프·테두리 모양도 갈린다 */
const CELL_STYLE: Record<PbStripState, string> = {
  attended: "bg-primary text-primary-foreground",
  missed: "bg-muted text-muted-foreground",
  upcoming: "border-[1.5px] border-dashed border-border text-muted-foreground",
  unlinked: "border-[1.5px] border-dotted border-border/60 text-muted-foreground/60",
  canceled: "bg-muted text-muted-foreground",
  before_join: "bg-muted/40 text-muted-foreground/40",
};

const STATE_LABEL: Record<PbStripState, string> = {
  attended: "출석",
  missed: "결석",
  upcoming: "예정",
  unlinked: "미정",
  canceled: "취소",
  before_join: "합류 전",
};

function CellGlyph({ state }: { state: PbStripState }) {
  if (state === "attended") return <Check className="size-4" aria-hidden />;
  if (state === "missed") return <X className="size-4" aria-hidden />;
  if (state === "canceled") return <Micro className="leading-4 text-inherit line-through">취소</Micro>;
  if (state === "upcoming") return <span aria-hidden className="size-1.5 rounded-full bg-current" />;
  return <Micro aria-hidden className="leading-4 text-inherit">—</Micro>;
}

function StripCell({ cell, sttAt }: { cell: PbStripCell; sttAt: string | null }) {
  return (
    <li
      aria-label={`${cell.label} ${STATE_LABEL[cell.state]}`}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg",
        CELL_STYLE[cell.state],
      )}
    >
      <Micro className="font-semibold leading-none text-inherit">{cell.label}</Micro>
      <span className="flex h-4 items-center justify-center">
        <CellGlyph state={cell.state} />
      </span>
      {/* 날짜는 연결된 벙이 있고 합류 전이 아닐 때만 — 빈 칸에 날짜를 지어내지 않는다 */}
      <Micro className="leading-none text-inherit opacity-80">
        {sttAt && cell.state !== "before_join" ? formatKST(sttAt, "M/D") : "\u00A0"}
      </Micro>
    </li>
  );
}

const LEGEND: { state: PbStripState; label: string }[] = [
  { state: "attended", label: "출석" },
  { state: "missed", label: "결석" },
  { state: "upcoming", label: "예정" },
  { state: "unlinked", label: "미정" },
];

/**
 * 회차 띠 — W1~W12 + 측정, 총 13칸을 7열로 접어 375px에 맞춘다.
 *
 * 칸 계산은 `buildSessStrip`(순수 코어) 몫이고 여기는 그리기만 한다. 날짜는 칸마다 연결된
 * 벙의 `sttAt`을 timestamptz로 보고 `formatKST`로 찍는다(서버가 UTC라 `dayjs().format`이면 하루 밀림).
 */
export function PbSessionStrip({
  me,
  sessions,
  cfg,
}: {
  me: PbParticipant;
  sessions: PbSession[];
  cfg: PbClassCfg;
}) {
  const cells = buildSessStrip({
    links: sessions,
    attendedGthrIds: new Set(me.attendedGthrIds),
    joinWkNo: me.joinWkNo,
    cfg,
  });
  const sttAtOf = new Map(sessions.map((s) => [s.gthrId, s.sttAt]));

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader label="SESSIONS" />
      <ul className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => (
          <StripCell
            key={cell.label}
            cell={cell}
            sttAt={cell.gthrId ? (sttAtOf.get(cell.gthrId) ?? null) : null}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {LEGEND.map(({ state, label }) => (
          <span key={state} className="flex items-center gap-1">
            <span aria-hidden className={cn("size-3 rounded-sm", CELL_STYLE[state])} />
            <Micro>{label}</Micro>
          </span>
        ))}
      </div>
    </div>
  );
}
