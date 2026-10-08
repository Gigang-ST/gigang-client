import { wkLabel } from "@/lib/pb-class";
import { teamGlance, type PbTeamGlance, type PbTeamSeries } from "@/lib/pb-class-chart";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { Body, Micro } from "@/components/common/typography";

import { formatPt } from "./format";
import { teamColorVar } from "./pb-team-color";
import { PbTeamScoreChartDynamic } from "./pb-team-score-chart-dynamic";

/** 범례 견본 — 그래프의 선을 그대로 줄여 그린다(내 팀은 굵게) */
function Swatch({ color, mine }: { color: string; mine: boolean }) {
  return (
    <svg aria-hidden width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth={mine ? 3.25 : 2} strokeLinecap="round" />
    </svg>
  );
}

/**
 * 그래프 위 한 줄 — 누적 출석 면의 「6주차엔 22명 중 18명이 나왔어요」와 같은 자리·같은 서체.
 * 두 면이 「한 줄 → 범례 → 그래프」로 같은 골격이라 세그먼트를 바꿔도 그래프가 제자리에 있다.
 * 팀 이름엔 조사를 붙이지 않는다 — 이름을 운영진이 짓기 때문에 「이/가」를 맞출 수 없다.
 */
function Glance({ g, measureWkNo }: { g: PbTeamGlance; measureWkNo: number | null }) {
  const num = "font-semibold tabular-nums text-foreground";
  const when = g.wkNo === measureWkNo ? "측정 주" : wkLabel(g.wkNo);
  return (
    <Body className="break-keep text-muted-foreground">
      {g.allTied ? (
        <>
          {when}엔 모든 팀이 <span className={num}>+{formatPt(g.gain)}점</span>씩 얻었어요
        </>
      ) : (
        <>
          {when}에 가장 많이 얻은 팀 ·{" "}
          {/* 셋 이상 나란하면 이름을 늘어놓지 않는다 — 360px 에서 두 줄로 꺾여 「+30점」만 혼자 내려가고 그래프가 밀린다.
              누가 나란한지는 바로 아래 범례·툴팁이 말한다. 시즌 초엔 다 같이 나와 동점이 흔하다 */}
          <span className="font-semibold text-foreground">
            {g.names.length >= 3 ? `${g.names.length}팀 공동` : g.names.join("·")}
          </span>{" "}
          <span className={num}>+{formatPt(g.gain)}점</span>
        </>
      )}
    </Body>
  );
}

/**
 * 팀별 점수 그래프 — 점수판 맨 아래 「Week by Week」 칸의 「팀 점수」 면(`PbFlowZone`).
 * 순위표가 못 하는 말(「언제 따라잡았나」)을 한다. 누구에게나 보인다(팀 단위 숫자뿐) — 구경꾼에겐 이 면 하나만 선다.
 *
 * 범례는 서버가 먼저 그린다: 범례 줄 수(팀 3~5개 → 360px 에서 한두 줄)는 데이터가 정하므로, 그래프 스켈레톤에
 * 넣으면 높이를 맞출 수 없다. 그래프 자리만 고정 높이(200)로 비워 두고 recharts 는 늦게 들어온다.
 */
export function PbTeamScoreFlow({
  series,
  myGrpId,
  measureWkNo,
}: {
  /** null = 팀 발표 전이거나 아직 아무도 점수를 못 받았다 → 빈 상태 */
  series: PbTeamSeries | null;
  myGrpId: string | null;
  measureWkNo: number | null;
}) {
  if (!series) return <EmptyState variant="card" message="첫 점수가 쌓이면 그려져요" />;

  const summary = series.teams.map((t) => `${t.grpNm} ${formatPt(t.total)}점`).join(", ");
  const glance = teamGlance(series);

  return (
    <>
      {glance && <Glance g={glance} measureWkNo={measureWkNo} />}
      <figure className="flex flex-col gap-2">
        <figcaption className="sr-only">주차별 팀 누적 점수 그래프. {summary}</figcaption>
        <ul aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.teams.map((t) => {
            const mine = t.grpId === myGrpId;
            return (
              <li key={t.grpId} className="flex min-w-0 items-center gap-1.5">
                <Swatch color={teamColorVar(t.colorNo)} mine={mine} />
                <Micro className={cn("truncate", mine && "font-semibold text-foreground")}>{t.grpNm}</Micro>
                <Micro className="font-semibold tabular-nums text-foreground">{formatPt(t.total)}</Micro>
              </li>
            );
          })}
        </ul>
        <PbTeamScoreChartDynamic series={series} myGrpId={myGrpId} measureWkNo={measureWkNo} />
      </figure>
    </>
  );
}
