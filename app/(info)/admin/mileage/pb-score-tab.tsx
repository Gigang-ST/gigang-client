"use client";

import { useState } from "react";

import { PB_PT_CDS, PB_PT_LABEL, type PbPtCd } from "@/lib/pb-class-score";
import type { PbGame } from "@/lib/queries/pb-class-game";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { SegmentControl } from "@/components/common/segment-control";
import { Body, Caption, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";

import { GroupDot, PbGameLoadError, PbGameSkeleton } from "./pb-game-parts";
import { PbMissionSection } from "./pb-mission-section";
import { PbRuleForm } from "./pb-rule-form";
import { usePbGame } from "./use-pb-game";

type View = "board" | "mission" | "rule";

/** 개인 점수표 열 머리 — 전체 이름은 title로 */
const PT_SHORT: Record<PbPtCd, string> = {
  ATTEND: "출석",
  JOIN: "참여",
  HOST: "개설",
  IMPROVE_MID: "중간",
  IMPROVE_FINAL: "최종",
  GOAL: "목표",
};

export function PbScoreTab({ evtId }: { evtId: string }) {
  const { game, loading, error, reload, run, busyKey } = usePbGame(evtId);
  const [view, setView] = useState<View>("board");

  if (loading) return <PbGameSkeleton />;
  if (!game) return <PbGameLoadError message={error} onRetry={() => void reload()} />;

  return (
    <div className="flex flex-col gap-4">
      <SegmentControl
        segments={[
          { value: "board", label: "점수판" },
          { value: "mission", label: "팀 미션" },
          { value: "rule", label: "배점 설정" },
        ]}
        value={view}
        onValueChange={setView}
      />

      {view === "board" && <ScoreboardPreview game={game} />}
      {view === "mission" && <PbMissionSection game={game} evtId={evtId} run={run} busyKey={busyKey} />}
      {view === "rule" && (
        // 서버 규칙이 바뀌면(저장 후 재조회) 폼을 새 값으로 다시 세운다. 규칙이 그대로면 key도 그대로라
        // 미션 토글 같은 다른 재조회가 고치던 입력을 날리지 않는다.
        <PbRuleForm key={JSON.stringify(game.rule)} rule={game.rule} evtId={evtId} run={run} busyKey={busyKey} />
      )}
    </div>
  );
}

/** 점수판 미리보기 — 서버가 원천에서 계산한 `scoreboard`를 그대로 보여 준다(클라이언트에서 다시 계산하지 않는다) */
function ScoreboardPreview({ game }: { game: PbGame }) {
  const { groups, members } = game.scoreboard;
  const groupById = new Map(game.groups.map((g) => [g.grpId, g]));
  const lateByPrt = new Map(game.participants.map((p) => [p.prtId, p.late]));

  // 팀전 대상은 점수순, 제외·미배정은 아래에 흐리게 — 점수가 0이라 순위에 섞이면 읽기 어렵다
  const inGame = members.filter((m) => m.inGame).sort((a, b) => b.total - a.total);
  const outGame = members.filter((m) => !m.inGame);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Body className="font-semibold">팀 순위</Body>
        {groups.length === 0 ? (
          <EmptyState variant="card" message="게임팀이 없어요. 팀 탭에서 만들어 주세요." />
        ) : (
          groups.map((g) => (
            <CardItem key={g.grpId} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Body className="w-6 shrink-0 text-center font-bold">{g.rank}</Body>
                <GroupDot colorNo={g.colorNo} className="size-4" />
                <Body className="min-w-0 flex-1 truncate font-semibold">{g.grpNm}</Body>
                <Caption className="shrink-0">{g.memberCnt}명</Caption>
                <Body className="shrink-0 text-xl font-bold">{g.total}점</Body>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-secondary/60 p-3">
                <div className="flex flex-col gap-0.5">
                  <Micro>팀원 평균 합</Micro>
                  <Body className="font-semibold">{g.avgSum}</Body>
                </div>
                <div className="flex flex-col gap-0.5">
                  <Micro>전원 출석</Micro>
                  <Body className="font-semibold">+{g.allAttendBonus}</Body>
                  {g.allAttendWeeks.length > 0 && <Micro>W{g.allAttendWeeks.join(" · W")}</Micro>}
                </div>
                <div className="flex flex-col gap-0.5">
                  <Micro>미션</Micro>
                  <Body className="font-semibold">+{g.missionBonus}</Body>
                </div>
              </div>
            </CardItem>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Body className="font-semibold">개인 점수</Body>
        {members.length === 0 ? (
          <EmptyState variant="card" message="아직 점수 대상 참가자가 없어요." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border-[1.5px] border-border">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="sticky left-0 z-10 bg-secondary px-3 py-2">
                    <Micro>이름</Micro>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Micro>합계</Micro>
                  </th>
                  {PB_PT_CDS.map((cd) => (
                    <th key={cd} className="px-2 py-2 text-right" title={PB_PT_LABEL[cd]}>
                      <Micro>{PT_SHORT[cd]}</Micro>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...inGame, ...outGame].map((m) => {
                  const grp = m.grpId ? groupById.get(m.grpId) : undefined;
                  return (
                    <tr
                      key={m.prtId}
                      className={cn("border-b border-border last:border-b-0", !m.inGame && "text-muted-foreground")}
                    >
                      <td className="sticky left-0 z-10 bg-background px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {grp && <GroupDot colorNo={grp.colorNo} />}
                          <Caption className={cn("truncate font-semibold", m.inGame && "text-foreground")}>
                            {m.memNm}
                          </Caption>
                          {m.goalAchieved && (
                            <Badge variant="outline" className="shrink-0 border-success px-1.5 py-0">
                              <Micro className="text-success">목표 달성</Micro>
                            </Badge>
                          )}
                        </div>
                        {!m.inGame && <Micro>{lateByPrt.get(m.prtId) ? "팀전 제외" : "팀 미배정"}</Micro>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Caption className={cn("font-bold", m.inGame && "text-foreground")}>{m.total}</Caption>
                      </td>
                      {PB_PT_CDS.map((cd) => (
                        <td key={cd} className="px-2 py-2 text-right">
                          <Caption>{m.byCd[cd] || "·"}</Caption>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Caption>
          팀 점수 = 주차별 팀원 평균 점수의 합 + 전원 출석 보너스 + 미션. 늦은 합류자와 미배정은 점수에서 빠져요.
        </Caption>
      </section>
    </div>
  );
}
