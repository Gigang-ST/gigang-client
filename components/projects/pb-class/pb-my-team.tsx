import type { PbScoreGroup } from "@/lib/pb-class-score";
import type { PbGameParticipant } from "@/lib/queries/pb-class-game";

import { InfoRow } from "@/components/common/info-row";
import { Caption, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { PbTeamDot } from "./pb-team-color";
import { trnGroupLabel } from "./pb-training";
import { PbZone } from "./pb-zone";

/**
 * 훈련팀 값 — 이름 아래에 「어떻게 정해졌나」를 한 줄 단다.
 *
 * 훈련팀은 이제 목표·기록으로 저절로 정해진다(오너 2026-10-08). 그러면 「배정 전」은 거짓말이 된다 — 기다릴 게
 * 아니라 내가 목표나 기록을 올리면 되는 일이라서, 비었을 땐 할 일을 말한다. 정해졌으면 자동/고정을 갈라 말해,
 * 기록을 올렸는데 팀이 안 바뀐 사람이 이유(운영진 고정)를 바로 안다.
 */
function TrnGroupValue({ me }: { me: Pick<PbGameParticipant, "trnGrpCd" | "trnGrpFixedCd"> }) {
  const nm = trnGroupLabel(me.trnGrpCd);
  if (!nm) return <span className="text-[13px] font-normal text-muted-foreground">목표나 기록을 올리면 정해져요</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {nm}
      <Micro className="font-normal">{me.trnGrpFixedCd ? "운영진이 정했어요" : "목표·기록으로 정해져요"}</Micro>
    </span>
  );
}

/**
 * 내 팀 — 훈련팀(같이 훈련하는 페이스 그룹)과 게임팀(점수를 겨루는 팀) 두 가지를 나란히 말한다.
 *
 * 둘은 다른 개념이다. 훈련팀은 페이스별 훈련 편성이고, 게임팀은 팀전 점수판의 단위라서
 * 라벨을 섞어 부르면 "내 팀이 어디냐"를 두 번 묻게 된다.
 * 훈련팀은 알파벳 코드가 아니라 **목표 시간**(「45분 이하」)으로 부른다(오너 지시).
 * 늦은 합류자(W6~)는 게임팀이 없는 게 정상이므로 "배정 전"이 아니라 대상 아님으로 말한다.
 */
export function PbMyTeam({
  groups,
  me,
}: {
  groups: readonly PbScoreGroup[];
  me: Pick<PbGameParticipant, "trnGrpCd" | "trnGrpFixedCd" | "grpId" | "late">;
}) {
  const group = me.grpId ? (groups.find((g) => g.grpId === me.grpId) ?? null) : null;

  return (
    <PbZone label="My Team" lead="같이 훈련하는 팀과 같이 겨루는 팀">
      <CardItem className="flex flex-col py-1">
        <InfoRow label="훈련팀" value={<TrnGroupValue me={me} />} />
        <InfoRow
          label="게임팀"
          // 카드 맨 아래 줄엔 구분선이 필요 없다 — 늦은 합류자는 아래에 안내가 붙으므로 선을 남긴다
          className={me.late ? undefined : "border-b-0"}
          value={
            me.late ? (
              <span className="text-muted-foreground">해당 없음</span>
            ) : group ? (
              <span className="flex items-center gap-2">
                <PbTeamDot colorNo={group.colorNo} />
                {group.grpNm}
              </span>
            ) : (
              <span className="text-muted-foreground">배정 전</span>
            )
          }
        />
        {me.late && (
          <Caption className="pb-3 leading-relaxed">늦은 합류 — 팀전 대상이 아니에요</Caption>
        )}
      </CardItem>
    </PbZone>
  );
}
