import "server-only";

import { cache } from "react";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";
import { getTeamSignup, type TeamSignup } from "@/lib/team-signup";

/**
 * 지금 요청 팀의 가입 설정(§lib/team-signup) — 단계는 팀 설정 `feature.running_profile` 을 따른다.
 * 요청 주소를 읽으므로 Suspense 안·서버 액션에서만 부른다. 팀 설정은 서버 메모리 1분 캐시라 Vercel 계량 호출이 없다.
 */
export const getRequestTeamSignup = cache(async (): Promise<TeamSignup> => {
  const { teamId, teamCd } = await getRequestTeamContext();
  const runningProfile = await getTeamCfg(teamId, "feature.running_profile");
  return getTeamSignup(teamCd, { runningProfile });
});
