import { cache } from "react";
import { headers } from "next/headers";
import { TEAM_ID_BY_CD } from "@/lib/constants/gigang-team";
import { resolveTeamCdFromHost } from "@/lib/team-host";

export type RequestTeamContext = {
  teamId: string;
  teamCd: string;
};

/**
 * Host 문자열 → 팀. **정확한 주소만** 팀이 되고, 아니면 `null`이다(기강으로 폴백하지 않는다 —
 * 이유는 `lib/team-host.ts`). 팀 UUID는 코드 상수라 DB 조회가 없다.
 */
export function resolveTeamContextFromHost(host: string | null): RequestTeamContext | null {
  const teamCd = resolveTeamCdFromHost(host);
  if (!teamCd) return null;
  const teamId = TEAM_ID_BY_CD[teamCd];
  if (!teamId) return null;
  return { teamId, teamCd };
}

/**
 * 현재 요청의 Host 기준 팀. React `cache()`로 같은 렌더 안 중복 해석을 막는다.
 *
 * 모르는 주소의 페이지 요청은 proxy가 이미 404로 끊어 여기까지 오지 않는다. 그래도 오면
 * (proxy를 안 타는 `/api/*` 등) **던진다** — 기강으로 폴백하면 모르는 주소의 쓰기가 기강
 * 데이터에 조용히 쌓인다. 실패는 시끄러운 편이 낫다.
 */
export const getRequestTeamContext = cache(async (): Promise<RequestTeamContext> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const ctx = resolveTeamContextFromHost(host);
  if (!ctx) {
    throw new Error(`[request-team] 등록되지 않은 주소입니다: ${host ?? "(없음)"}`);
  }
  return ctx;
});
