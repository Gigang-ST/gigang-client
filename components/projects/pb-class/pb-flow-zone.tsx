import type { ReactNode } from "react";

import { HelpTip } from "@/components/common/help-tip";

import { PbFlowViews } from "./pb-flow-views";
import { PbZone } from "./pb-zone";

/** 그래프 읽는 법 — 지금 서 있는 면에 대해서만 말한다(구경꾼에게 출석 설명을 늘어놓지 않는다) */
function FlowHelp({ crew, team }: { crew: boolean; team: boolean }) {
  return (
    <HelpTip title="그래프 읽는 법">
      <ul className="flex flex-col gap-1.5">
        {crew && (
          <li>
            <span className="font-semibold">누적 출석</span> · 공식훈련·측정에 나온 횟수를 회차마다 쌓았어요. 합류 전
            회차는 세지 않고, 취소된 회차는 누구의 출석에도 들어가지 않아요.
          </li>
        )}
        {team && (
          <li>
            <span className="font-semibold">팀 점수</span> · 순위표와 같은 규칙으로 주마다 더했어요. 선 끝이 지금 팀
            점수예요.
          </li>
        )}
      </ul>
    </HelpTip>
  );
}

/**
 * 점수판 맨 아래 칸 — 주차를 가로로 놓는 그래프 둘(누적 출석 · 팀 점수)을 한 자리에서 세그먼트로 갈아 본다.
 *
 * 오너 2026-10-08: 「누적출석 그래프 옆에 출석표 있잖아 — 출석표는 빼버리고 그 자리에 팀 점수 그래프 넣어」.
 * 둘 다 「1주차 → 측정」을 가로축으로 쓰는 같은 모양의 계기라, 따로 세우면 비슷한 그래프 두 장이 세로로 쌓여
 * 스크롤만 길어진다. 머리(라벨·리드문)는 두 면 공통이라 어느 면을 보든 말이 맞게 쓴다.
 *
 * - 둘 다 있으면(승인된 참가자) 세그먼트. 하나뿐이면(구경꾼 = 팀 점수만, 게임 조회 실패 = 누적 출석만) 그 면만 —
 *   고를 게 하나인 세그먼트는 버튼이 아니라 장식이다.
 * - 둘 다 없으면 칸째 안 그린다.
 */
export function PbFlowZone({ crew, team }: { crew: ReactNode | null; team: ReactNode | null }) {
  if (!crew && !team) return null;
  const both = !!crew && !!team;
  const lead = both ? "주마다 쌓인 출석과 팀 점수" : crew ? "주마다 쌓인 출석" : "주마다 쌓인 팀 점수";

  return (
    <PbZone label="Week by Week" lead={lead} action={<FlowHelp crew={!!crew} team={!!team} />}>
      {both ? <PbFlowViews crew={crew} team={team} /> : (crew ?? team)}
    </PbZone>
  );
}
