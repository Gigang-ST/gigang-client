import type { ReactNode } from "react";

import { buildPbTeamSeries, buildPbTrack } from "@/lib/pb-class-chart";
import type { PbRule, PbScoreboard } from "@/lib/pb-class-score";
import type { PbGameParticipant } from "@/lib/queries/pb-class-game";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { Body, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { formatPt } from "./format";
import { PbFlowZone } from "./pb-flow-zone";
import { PbPaceTrack } from "./pb-pace-track";
import { PbTeamDot } from "./pb-team-color";
import { PbTeamScoreFlow } from "./pb-team-score-flow";
import { PbZone } from "./pb-zone";

type PbScoreboardProps = {
  scoreboard: PbScoreboard;
  rule: PbRule;
  /** 내 게임팀 — 목록에서 테두리로만 짚는다(배경을 칠하면 1등 강조와 섞인다) */
  myGrpId: string | null;
  /**
   * 승인된 참가자일 때만 넘긴다. 구경하는 사람(미신청·입금 대기)에겐 이름이 실리는 칸(10K 트랙·누적 출석)이 없다 —
   * 정산과 같은 공개 범위다. 화면에서 숨기는 게 아니라 **아예 안 만든다**(트랙 데이터는 클라이언트 props 라
   * 만들어 두면 RSC 로 실려 나간다).
   */
  me: { memId: string } | null;
  /**
   * 게임 참가자 전원(입금 대기자 포함 — 거르는 건 받는 쪽이 한다). 팀 그래프는 합류 주차(분모)를,
   * 트랙은 기록·얼굴을 여기서 읽는다. 이 컴포넌트는 서버 컴포넌트라 받기만 해서는 클라이언트로 안 나간다.
   */
  participants: readonly PbGameParticipant[];
  /** 측정 벙의 주차 — 팀 그래프 마지막 눈금을 「측정」으로 */
  measureWkNo: number | null;
  /** 누적 출석 면(전원 보드 조회 — 호출부가 Suspense 로 감싸 넘긴다). `me`가 있을 때만 붙인다 */
  crew?: ReactNode;
};

function TeamScoreHelp({ rule }: { rule: PbRule }) {
  return (
    <HelpTip title="팀 점수는 이렇게 매겨요">
      팀 점수 = 주마다 팀원 1인당 평균 점수의 합 + 전원 출석 보너스.
      <br />
      합계가 아니라 평균이라 인원이 많다고 유리하지 않아요. 그 주 팀원이 모두 공식훈련에 나오면
      보너스 +{rule.pt.allAttend}점이에요.
    </HelpTip>
  );
}

/**
 * 점수판 탭 — ① 팀 순위(Scoreboard) → ② 10K 예상기록(10K Forecast) → ③ 주차별 그래프(Week by Week: 누적 출석 | 팀 점수).
 *
 * 이건 기강 포인트(원장·히든 운영)가 아니라 **프로젝트 게임 점수**라 숫자를 그대로 연다 —
 * 그래서 이름도 「점수」다(「포인트」라고 부르면 히든인 제도와 헷갈린다).
 * 순위는 코어(`computeScoreboard`)가 매겨 정렬해 준 그대로 그린다. 여기서 다시 정렬하거나
 * 동점을 가르지 않는다 — 코어가 공동 순위로 매긴 걸 화면이 뒤집으면 두 화면의 등수가 갈린다.
 *
 * ## 순서 (오너 2026-10-08: 「1번은 스코어보드, 2번은 10K forecast, 3번이 그 그래프」)
 * 지금 순위 → 지금 실력 → 여기까지 온 흐름. 그래프 둘(누적 출석·팀 점수)은 같은 주차 축이라 한 칸에서 세그먼트로 갈아 본다.
 * 「내 점수」는 내 현황 탭으로 옮겼다 — 이 탭은 크루·팀 이야기만 한다.
 * 구경하는 사람(미신청·입금 대기)은 ①과 ③의 팀 점수만 본다 — 나머지는 이름이 실린다.
 */
export function PbScoreboard({ scoreboard, rule, myGrpId, me, participants, measureWkNo, crew }: PbScoreboardProps) {
  const { groups } = scoreboard;
  const series = groups.length > 0 ? buildPbTeamSeries({ scoreboard, members: participants, rule }) : null;
  // 트랙은 승인된 참가자에게만 — 데이터 자체를 그때만 만든다(만들어 두고 숨기면 RSC 로 실려 나간다)
  const track = me
    ? buildPbTrack({
        participants,
        rule,
        myMemId: me.memId,
        colorOfGrp: new Map(groups.map((g) => [g.grpId, g.colorNo])),
      })
    : null;

  // 팀 점수 면 — 참가자에겐 팀 발표 전에도 세운다(세그먼트가 하나였다 둘이었다 하면 컨트롤이 튄다. 면 안에서 빈 상태로 말한다).
  // 구경꾼에게 팀 발표 전 빈 그래프는 세우지 않는다 — 순위표가 이미 「팀 발표 전이에요」라고 말한다.
  const team =
    me || groups.length > 0 ? <PbTeamScoreFlow series={series} myGrpId={myGrpId} measureWkNo={measureWkNo} /> : null;

  return (
    <div className="flex flex-col gap-7">
      <PbZone label="Scoreboard" lead="게임팀 순위 — 주마다 평균으로 겨뤄요" action={<TeamScoreHelp rule={rule} />}>
        {groups.length === 0 ? (
          <EmptyState variant="card" message="팀 발표 전이에요" />
        ) : (
          <ol aria-label="팀 순위" className="flex flex-col gap-2">
            {groups.map((g) => {
              const isMine = g.grpId === myGrpId;
              return (
                <li key={g.grpId}>
                  <CardItem
                    data-mine={isMine ? "true" : undefined}
                    className={cn("flex items-center gap-3", isMine && "border-primary")}
                  >
                    <span className="w-6 shrink-0 text-center font-numeric text-xl font-medium tabular-nums text-foreground">
                      {g.rank}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <PbTeamDot colorNo={g.colorNo} />
                        <Body className="truncate font-semibold">{g.grpNm}</Body>
                        {isMine && <Micro className="shrink-0 font-semibold text-primary">내 팀</Micro>}
                      </div>
                      <Micro className="tabular-nums">
                        평균 {formatPt(g.avgSum)} · 전원출석 +{formatPt(g.allAttendBonus)}
                      </Micro>
                    </div>
                    <Body className="shrink-0 font-numeric text-2xl font-medium tabular-nums">
                      {formatPt(g.total)}
                      <span className="text-base font-medium text-muted-foreground">점</span>
                    </Body>
                  </CardItem>
                </li>
              );
            })}
          </ol>
        )}
      </PbZone>

      {me && <PbPaceTrack track={track} rule={rule} />}

      <PbFlowZone crew={me ? (crew ?? null) : null} team={team} />
    </div>
  );
}
