import "server-only";

import { cache } from "react";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";
import { buildTeamCopy, type TeamCopy } from "@/lib/team-copy";

/**
 * 지금 요청의 팀 문구(`lib/team-copy.ts`). 서버 페이지가 불러 **props 로 내려 준다**(Context 를 쓰지 않는다 — AGENTS.md
 * 「각 페이지가 자기 데이터를 직접 조회」). 결과는 작은 문자열 묶음이라 RSC payload 부담도 없다.
 *
 * ⚠ 요청 주소를 읽으므로 **Suspense 안(요청 때 그리는 부분)에서만** 부른다. 미리 만들어 두는 껍데기(정적 셸)에서 부르면
 * 그 페이지 전체가 껍데기 없이 그려진다. 팀 설정은 서버 메모리 1분 캐시라 비용은 없다.
 */
export const getTeamCopy = cache(async (): Promise<TeamCopy> => {
  const { teamId, teamCd } = await getRequestTeamContext();
  const [crewName, memberNoun, wordmark] = await Promise.all([
    getTeamCfg(teamId, "brand.name"),
    getTeamCfg(teamId, "brand.member_noun"),
    getTeamCfg(teamId, "brand.wordmark"),
  ]);
  return buildTeamCopy({ teamCd, crewName, memberNoun, wordmark });
});
