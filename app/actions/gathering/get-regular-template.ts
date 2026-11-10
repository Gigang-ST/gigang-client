"use server";

import { withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";
import type { TeamCfgValue } from "@/lib/team-cfg/registry";

export type RegularGatheringTemplate = NonNullable<TeamCfgValue<"gathering.regular_template">>;

/**
 * 접속한 팀의 정기 모임 템플릿(팀 설정 `gathering.regular_template`). 없으면 null — 폼이 자동 채움을 건너뛴다.
 * 모임 만들기에서 유형을 「정기」로 고를 때만 부른다(폼을 열 때마다 읽지 않는다).
 */
export async function getRegularGatheringTemplate(): Promise<RegularGatheringTemplate | null> {
  return withMember(async () => {
    const { teamId } = await getRequestTeamContext();
    return getTeamCfg(teamId, "gathering.regular_template");
  });
}
