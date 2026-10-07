import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";

import { formatKST, parseEventTime } from "@/lib/dayjs";
import {
  buildSessStrip,
  wkLabel,
  weekNoOf,
  type PbClassCfg,
  type PbStripCell,
  type PbStripState,
} from "@/lib/pb-class";
import type { PbEvent, PbParticipant, PbSession } from "@/lib/queries/pb-class";
import { cn } from "@/lib/utils";

import { Body, Caption, H2, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { dayDiff, formatPeriod } from "./format";

/** 히어로 진행 점 — 띠(`PbSessionStrip`)와 같은 상태 어휘를 점 크기로 줄였다 */
const DOT_STYLE: Record<PbStripState, string> = {
  attended: "bg-primary",
  missed: "bg-muted-foreground/25",
  upcoming: "border-[1.5px] border-dashed border-muted-foreground/50",
  unlinked: "border border-dotted border-muted-foreground/30",
  canceled: "bg-muted-foreground/15",
  before_join: "bg-muted",
};

const DOT_LABEL: Record<PbStripState, string> = {
  attended: "출석",
  missed: "결석",
  upcoming: "예정",
  unlinked: "미정",
  canceled: "취소",
  before_join: "합류 전",
};

export type PbPhase =
  | { kind: "before"; dDay: number }
  | { kind: "week"; wkNo: number }
  | { kind: "measure" }
  | { kind: "closed" };

/**
 * 지금이 시즌의 어디인가 — 히어로 칩과 훈련표 「이번 주」가 같은 판정을 쓰게 한 곳에서 낸다.
 *
 * `currentWeekNo`는 시작 전에도 1로 눌러 주므로(합류 주차 기본값용) 여기선 쓰지 않고 날 주차를 본다 —
 * 시작 전에 「지금 1주차」라고 말하면 거짓말이다. 날짜 차이라 양쪽 다 KST 로 맞춘다.
 */
export function pbPhaseOf(evt: PbEvent, cfg: PbClassCfg, nowIso: string): PbPhase {
  const today = formatKST(nowIso, "YYYY-MM-DD");
  if (evt.sttsEnm === "CLOSED" || today > evt.endDt) return { kind: "closed" };
  const wk = weekNoOf(nowIso, evt.sttDt);
  if (wk < 1) return { kind: "before", dDay: dayDiff(today, evt.sttDt) };
  if (wk <= cfg.totSessCnt - 1) return { kind: "week", wkNo: wk };
  return { kind: "measure" };
}

function PhaseChip({ phase }: { phase: PbPhase }) {
  const text =
    phase.kind === "before"
      ? `D-${phase.dDay} 시작`
      : phase.kind === "week"
        ? `지금 ${wkLabel(phase.wkNo)}`
        : phase.kind === "measure"
          ? "측정 주간"
          : "종료";
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-semibold tabular-nums",
        phase.kind === "closed" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
      )}
    >
      {text}
    </span>
  );
}

/** 다음에 열릴 회차 — 삭제(한파 취소)·이미 열린 벙은 건너뛴다. 시각순 */
function nextSession(sessions: readonly PbSession[]): PbSession | null {
  return (
    [...sessions]
      .filter((s) => !s.delYn && !s.held)
      .sort((a, b) => parseEventTime(a.sttAt).valueOf() - parseEventTime(b.sttAt).valueOf())[0] ?? null
  );
}

function relDay(sttAt: string, nowIso: string): string {
  const d = dayDiff(formatKST(nowIso, "YYYY-MM-DD"), formatKST(sttAt, "YYYY-MM-DD"));
  if (d <= 0) return "오늘";
  if (d === 1) return "내일";
  return `D-${d}`;
}

/** 다음 공식훈련 카드 — 벙 상세로 바로 간다(참석 체크가 거기서 일어난다) */
function NextSessionCard({ sess, nowIso }: { sess: PbSession; nowIso: string }) {
  const kind = sess.sessType === "MEASURE" ? "10K 측정" : `${wkLabel(sess.wkNo)} 공식훈련`;
  const rel = relDay(sess.sttAt, nowIso);
  return (
    <CardItem asChild className="flex min-h-[72px] items-center gap-3 transition-colors active:bg-muted/60">
      <Link href={`/gatherings/${sess.gthrId}`} aria-label={`다음 ${kind} 벙 보기`}>
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <CalendarDays className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Micro className="font-semibold text-primary">다음 {kind}</Micro>
          <Body className="font-semibold tabular-nums">{formatKST(sess.sttAt, "M월 D일 (dd) HH:mm")}</Body>
          <Caption className="truncate">{sess.gthrNm}</Caption>
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <Micro
            className={cn(
              "font-semibold tabular-nums",
              rel === "오늘" ? "text-primary" : "text-foreground",
            )}
          >
            {rel}
          </Micro>
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
        </span>
      </Link>
    </CardItem>
  );
}

/**
 * 13점 진행 — 띠의 요약판. 마지막 점(측정)만 네모로 세워 「시험 날」이 끝에 있다는 걸 모양으로 말한다.
 * 이번 주 칸에는 아래 작은 눈금을 단다(어디까지 왔는지).
 */
function ProgressDots({ cells, focusWk }: { cells: PbStripCell[]; focusWk: number | null }) {
  const attended = cells.filter((c) => c.state === "attended").length;
  return (
    <ol aria-label={`${cells.length}회 중 ${attended}회 출석`} className="flex items-start justify-between">
      {cells.map((c) => {
        const isMeasure = c.sessType === "MEASURE";
        const isNow = focusWk !== null && c.sessType === "TRAINING" && c.wkNo === focusWk;
        return (
          <li key={c.label} aria-label={`${c.label} ${DOT_LABEL[c.state]}`} className="flex flex-col items-center gap-1">
            <span
              aria-hidden
              className={cn("size-4 shrink-0", isMeasure ? "rounded-[4px]" : "rounded-full", DOT_STYLE[c.state])}
            />
            <span aria-hidden className={cn("h-1 w-1 rounded-full", isNow ? "bg-foreground" : "bg-transparent")} />
          </li>
        );
      })}
    </ol>
  );
}

/** 참가자 요약 한 줄 — 출석 n회 · 환급 예상(또는 보증금 없음) / 전액까지 */
function ProgressSummary({ me }: { me: PbParticipant }) {
  const { summary } = me;
  const noRefund = summary.late || summary.required === null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Caption className="tabular-nums">
        출석 <span className="font-semibold text-foreground">{summary.attdCnt}회</span>
        {" · "}
        {noRefund ? (
          "보증금 없이 참가"
        ) : (
          <>
            환급 예상 <span className="font-semibold text-foreground">{summary.refund.toLocaleString()}원</span>
          </>
        )}
      </Caption>
      {!noRefund && (
        <Micro className={cn("shrink-0 font-semibold tabular-nums", summary.toFull === 0 && "text-success")}>
          {summary.toFull === 0 ? "전액 확보" : `전액까지 ${summary.toFull}회`}
        </Micro>
      )}
    </div>
  );
}

/**
 * PB 클래스 히어로 — 탭 위에 늘 서는 「지금 어디인가」.
 *
 * 탭을 넘겨도 이 칸은 그대로라, 어느 탭에서든 「몇 주차 / 다음 훈련 언제 / 내 출석」을 다시
 * 찾으러 가지 않게 한다. 자세한 숫자(띠·환급 표)는 「내 현황」 탭이 맡고 여기는 한 줄 요약만 둔다.
 */
export function PbHero({
  evt,
  cfg,
  sessions,
  nowIso,
  me,
}: {
  evt: PbEvent;
  cfg: PbClassCfg;
  sessions: PbSession[];
  nowIso: string;
  /** 승인된 참가자만 — 입금 대기·미신청에겐 진행 점을 세우지 않는다(셀 출석이 없다) */
  me: PbParticipant | null;
}) {
  const phase = pbPhaseOf(evt, cfg, nowIso);
  const next = phase.kind === "closed" ? null : nextSession(sessions);
  const dow = parseEventTime(evt.sttDt).format("dd");
  const cells = me
    ? buildSessStrip({
        links: sessions,
        attendedGthrIds: new Set(me.attendedGthrIds),
        joinWkNo: me.joinWkNo,
        cfg,
      })
    : null;

  return (
    <section aria-label="프로젝트 개요" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-numeric text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
            PB Class
          </p>
          <PhaseChip phase={phase} />
        </div>
        <H2 className="break-keep">{evt.evtNm}</H2>
        <Caption className="tabular-nums">
          {formatPeriod(evt.sttDt, evt.endDt)} · 매주 {dow}요일 공식훈련 {cfg.totSessCnt - 1}회 + 10K 측정
        </Caption>
      </div>

      {next ? (
        <NextSessionCard sess={next} nowIso={nowIso} />
      ) : (
        phase.kind !== "closed" && (
          <CardItem variant="dashed" className="py-3 text-center">
            <Caption>다음 공식훈련 벙은 운영진이 곧 열어요</Caption>
          </CardItem>
        )
      )}

      {me && cells && (
        <div className="flex flex-col gap-2">
          <ProgressDots cells={cells} focusWk={phase.kind === "week" ? phase.wkNo : null} />
          <ProgressSummary me={me} />
        </div>
      )}
    </section>
  );
}
