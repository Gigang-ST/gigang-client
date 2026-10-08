import { PB_PT_CDS, PB_PT_LABEL, type PbRule, type PbScoreboard } from "@/lib/pb-class-score";

import { HelpTip } from "@/components/common/help-tip";
import { InfoRow } from "@/components/common/info-row";
import { StatCard } from "@/components/common/stat-card";
import { Caption } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { formatPt } from "./format";
import { PbZone } from "./pb-zone";

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

/**
 * 내 점수 — 내 현황 탭, 「My Team」 바로 아래(오너 2026-10-08: 「마이스코어는 내 현황으로」).
 *
 * 점수판 탭에 있을 땐 팀 그래프 바로 아래에서 「팀 숫자 중 내 몫」으로 읽혔다. 내 현황에선 바로 위가
 * 내 게임팀이라 같은 말(팀 → 그 팀에 내가 보탠 점수)이 한 칸 거리에서 이어진다.
 * 그리는 조건은 호출부가 정한다 — 팀 발표 전(누구도 점수를 못 받는다)·늦은 합류(바로 위 My Team이 이미
 * 「팀전 대상이 아니에요」라고 말한다)엔 이 칸을 세우지 않는다.
 */
export function PbMyScore({ memId, scoreboard, rule }: { memId: string; scoreboard: PbScoreboard; rule: PbRule }) {
  return (
    <PbZone label="My Score" lead="내가 팀에 보탠 점수" action={<PointRuleHelp rule={rule} />}>
      <MyScoreBody memId={memId} scoreboard={scoreboard} />
    </PbZone>
  );
}

function MyScoreBody({ memId, scoreboard }: { memId: string; scoreboard: PbScoreboard }) {
  const mine = scoreboard.members.find((m) => m.memId === memId);
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
