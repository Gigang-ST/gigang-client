import type { ReactNode } from "react";

import { buildPbTeamSeries, buildPbTrack } from "@/lib/pb-class-chart";
import {
  PB_PT_CDS,
  PB_PT_LABEL,
  type PbMemberScore,
  type PbRule,
  type PbScoreboard,
} from "@/lib/pb-class-score";
import type { PbGameParticipant } from "@/lib/queries/pb-class-game";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { InfoRow } from "@/components/common/info-row";
import { StatCard } from "@/components/common/stat-card";
import { Body, Caption, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { formatPt } from "./format";
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
   * 승인된 참가자일 때만 넘긴다. 구경하는 사람(미신청·입금 대기)에겐 「내 점수」 블록 자체가 없다.
   * `late`는 팀전 제외라 점수 대신 안내가 선다.
   * **10K 트랙·크루 출석도 이 값으로 연다** — 이름과 기록·출석이 같이 실리는 섹션이라 정산과 같은 공개 범위다.
   */
  me: { memId: string; late: boolean } | null;
  /**
   * 게임 참가자 전원(입금 대기자 포함 — 거르는 건 받는 쪽이 한다). 팀 그래프는 합류 주차(분모)를,
   * 트랙은 기록·얼굴을 여기서 읽는다. 이 컴포넌트는 서버 컴포넌트라 받기만 해서는 클라이언트로 안 나간다.
   */
  participants: readonly PbGameParticipant[];
  /** 측정 벙의 주차 — 팀 그래프 마지막 눈금을 「측정」으로 */
  measureWkNo: number | null;
  /** 크루 출석(전원 보드 조회 — 호출부가 Suspense 로 감싸 넘긴다). `me`가 있을 때만 그린다 */
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

/** 점수 배점 안내 — 숫자는 전부 관리자 설정값(rule)에서 뽑는다. 설정이 바뀌면 안내도 같이 바뀐다 */
function PointRuleHelp({ rule }: { rule: PbRule }) {
  const { pt } = rule;
  return (
    <HelpTip title="점수는 이렇게 쌓여요">
      <ul className="flex flex-col gap-1">
        <li>출석 {pt.attend}점 · 공식훈련·측정</li>
        <li>일정 참여 {pt.join}점 · 공식훈련 밖 벙(본인 포함 {pt.joinMinAttd}명 이상 모인 벙)</li>
        <li>
          일정 개설 {pt.host}점 · 본인 포함 {pt.hostMinAttd}명 이상 참석
        </li>
        <li>
          기록 1% 단축마다 {pt.improvePerPct}점 · 중간 최대 {pt.improveMidMax}점, 최종 최대{" "}
          {pt.improveFinalMax}점
        </li>
        <li>목표 달성 {pt.goal}점 · 10K가 목표 이내</li>
      </ul>
    </HelpTip>
  );
}

function MyScore({ me, scoreboard }: { me: { memId: string; late: boolean }; scoreboard: PbScoreboard }) {
  // 늦은 합류는 점수가 0이 아니라 "대상이 아님"이다 — 0점을 보여 주면 못 한 사람처럼 읽힌다
  if (me.late) {
    return (
      <CardItem variant="dashed" className="text-center">
        <Caption className="text-foreground">늦은 합류는 팀 점수에 들어가지 않아요</Caption>
      </CardItem>
    );
  }

  const mine: PbMemberScore | undefined = scoreboard.members.find((m) => m.memId === me.memId);
  if (!mine || !mine.inGame) {
    return (
      <CardItem variant="dashed" className="text-center">
        <Caption className="text-foreground">게임팀이 정해지면 점수가 쌓여요</Caption>
      </CardItem>
    );
  }

  // 0점 줄은 감춘다 — 여섯 줄 중 다섯이 0이면 "아직 못 한 것"만 길게 나열된다
  const rows = PB_PT_CDS.filter((cd) => mine.byCd[cd] > 0);

  return (
    <div className="flex flex-col gap-3">
      <StatCard value={`${formatPt(mine.total)}점`} label="내 점수" className="tabular-nums" />
      {rows.length > 0 ? (
        <CardItem className="flex flex-col py-1">
          {rows.map((cd, i) => (
            <InfoRow
              key={cd}
              label={PB_PT_LABEL[cd]}
              value={`+${formatPt(mine.byCd[cd])}점`}
              className={i === rows.length - 1 ? "border-b-0" : undefined}
            />
          ))}
        </CardItem>
      ) : (
        <Caption className="text-center">아직 점수가 없어요</Caption>
      )}
    </div>
  );
}

/**
 * 점수판 탭 — 팀 순위 → 팀 점수 흐름 → 내 점수 → 10K 트랙 → 크루 출석.
 *
 * 이건 기강 포인트(원장·히든 운영)가 아니라 **프로젝트 게임 점수**라 숫자를 그대로 연다 —
 * 그래서 이름도 「점수」다(「포인트」라고 부르면 히든인 제도와 헷갈린다).
 * 순위는 코어(`computeScoreboard`)가 매겨 정렬해 준 그대로 그린다. 여기서 다시 정렬하거나
 * 동점을 가르지 않는다 — 코어가 공동 순위로 매긴 걸 화면이 뒤집으면 두 화면의 등수가 갈린다.
 *
 * ## 순서
 * 점수 이야기(팀 순위 → 그 순위가 쌓인 흐름 → 그중 내 몫)를 한 묶음으로 끝내고, 크루 이야기(지금 실력 →
 * 같이 나온 기록)를 잇는다. 「내 점수」가 팀 숫자 바로 아래 있어야 「내가 저 선에 얼마를 보탰나」로 읽힌다 —
 * 맨 끝에 두면 트랙·출석표를 다 지나서야 나와 팀 숫자와 떨어진다.
 * 구경하는 사람(미신청·입금 대기)은 앞의 둘(팀 단위 숫자)만 본다 — 뒤 셋은 이름이 실린다.
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

      {/* 팀 발표 전엔 순위표가 이미 「발표 전」이라고 말한다 — 같은 말을 하는 빈 칸을 하나 더 세우지 않는다 */}
      {groups.length > 0 && <PbTeamScoreFlow series={series} myGrpId={myGrpId} measureWkNo={measureWkNo} />}

      {/* 팀이 발표되기 전엔 누구도 점수를 못 받는다 — 빈 「내 점수」 블록을 세울 이유가 없다 */}
      {me && groups.length > 0 && (
        <PbZone label="My Score" lead="내가 팀에 보탠 점수" action={<PointRuleHelp rule={rule} />}>
          <MyScore me={me} scoreboard={scoreboard} />
        </PbZone>
      )}

      {me && <PbPaceTrack track={track} rule={rule} />}
      {me && crew}
    </div>
  );
}
