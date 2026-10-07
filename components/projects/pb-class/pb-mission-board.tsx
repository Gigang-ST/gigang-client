import { Check } from "lucide-react";

import { wkLabel } from "@/lib/pb-class";
import type { PbScoreGroup } from "@/lib/pb-class-score";
import type { PbGameMission } from "@/lib/queries/pb-class-game";

import { Caption, Micro } from "@/components/common/typography";
import { formatPt } from "./format";
import { PbTeamDot } from "./pb-team-color";
import { PbZone } from "./pb-zone";

/**
 * 팀 미션 현황 — 점수판의 「미션 +N」이 어디서 왔는지 풀어 보여 준다.
 *
 * 팀 카드엔 미션 보너스 합계만 있어서 "우리 팀은 뭘 못 했지?"를 물을 곳이 없었다. 미션마다 성공한 팀을
 * 팀 색 점 + 이름으로 단다(색만으로 가르지 않는다). 판정은 운영진 몫이라 여기선 결과만 그린다.
 */
export function PbMissionBoard({
  missions,
  groups,
  myGrpId,
}: {
  missions: readonly PbGameMission[];
  groups: readonly PbScoreGroup[];
  myGrpId: string | null;
}) {
  if (missions.length === 0) return null;
  const byId = new Map(groups.map((g) => [g.grpId, g]));

  return (
    <PbZone label="Team Missions" lead="해낸 팀에 점수가 붙어요">
      <ul className="flex flex-col">
        {missions.map((m) => {
          const succ = m.succGrpIds.map((id) => byId.get(id)).filter((g): g is PbScoreGroup => !!g);
          const mineDone = myGrpId !== null && m.succGrpIds.includes(myGrpId);
          return (
            <li key={m.msnId} className="rule-row flex flex-col gap-1.5 py-3">
              <div className="flex items-start gap-3">
                <Micro className="w-12 shrink-0 pt-px font-semibold tabular-nums text-foreground">
                  {m.wkNo !== null ? wkLabel(m.wkNo) : "시즌 중"}
                </Micro>
                <Caption className="min-w-0 flex-1 break-keep leading-snug text-foreground">{m.msnNm}</Caption>
                <span className="shrink-0 font-numeric text-sm font-medium tabular-nums text-primary">
                  +{formatPt(m.pt)}
                </span>
              </div>
              {succ.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-15">
                  {mineDone && (
                    <Micro className="flex items-center gap-0.5 font-semibold text-success">
                      <Check aria-hidden className="size-3" />
                      우리 팀 성공
                    </Micro>
                  )}
                  {succ.map((g) => (
                    <span key={g.grpId} className="flex items-center gap-1">
                      <PbTeamDot colorNo={g.colorNo} className="size-2.5" />
                      <Micro>{g.grpNm}</Micro>
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </PbZone>
  );
}
