import type { PbTeamSeries } from "@/lib/pb-class-chart";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { Micro } from "@/components/common/typography";

import { formatPt } from "./format";
import { teamColorVar } from "./pb-team-color";
import { PbTeamScoreChartDynamic } from "./pb-team-score-chart-dynamic";
import { PbZone } from "./pb-zone";

/** 범례 견본 — 그래프의 선을 그대로 줄여 그린다(내 팀은 굵게) */
function Swatch({ color, mine }: { color: string; mine: boolean }) {
  return (
    <svg aria-hidden width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth={mine ? 3.25 : 2} strokeLinecap="round" />
    </svg>
  );
}

/**
 * 팀별 점수 그래프 — 순위표 바로 아래에서 「어떻게 여기까지 왔나」를 답한다. 누구에게나 보인다(팀 단위 숫자뿐).
 *
 * 범례는 서버가 먼저 그린다: 범례 줄 수(팀 3~5개 → 360px 에서 한두 줄)는 데이터가 정하므로, 그래프 스켈레톤에
 * 넣으면 높이를 맞출 수 없다. 그래프 자리만 고정 높이(200)로 비워 두고 recharts 는 늦게 들어온다.
 */
export function PbTeamScoreFlow({
  series,
  myGrpId,
  measureWkNo,
}: {
  /** null = 팀은 있는데 아직 아무도 점수를 못 받았다. 팀 발표 전엔 이 섹션 자체를 세우지 않는다(점수판이 거른다) */
  series: PbTeamSeries | null;
  myGrpId: string | null;
  measureWkNo: number | null;
}) {
  const summary = series?.teams.map((t) => `${t.grpNm} ${formatPt(t.total)}점`).join(", ");

  return (
    <PbZone label="Team Race" lead="주마다 쌓인 팀 점수">
      {!series ? (
        <EmptyState variant="card" message="첫 점수가 쌓이면 그려져요" />
      ) : (
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
      )}
    </PbZone>
  );
}
