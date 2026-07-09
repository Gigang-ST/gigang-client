import { cache } from "react";
import { headers } from "next/headers";
import {
  DEFAULT_FALLBACK_TEAM_ID,
  TEAM_ID_BY_CD,
} from "@/lib/constants/gigang-team";

export type RequestTeamContext = {
  teamId: string;
  teamCd: string;
};

const ENV_HOST_PREFIXES = new Set(["dev", "stg", "stage", "www", "preview"]);

/** Host 첫 라벨(또는 환경 prefix 제거 후)을 team_cd 후보로 쓴다. 클라이언트는 `window.location.hostname`을 넘기면 된다. */
export function extractTeamCdFromHost(host: string | null): string {
  if (!host) return "gigang";
  const hostNoPort = host.split(":")[0].toLowerCase();
  if (
    hostNoPort === "localhost" ||
    hostNoPort === "127.0.0.1" ||
    hostNoPort.endsWith(".localhost")
  ) {
    return "gigang";
  }
  const labels = hostNoPort.split(".").filter(Boolean);
  if (labels.length === 0) return "gigang";

  // dev.gigang.team / stg.gigang.team 같은 환경 prefix는 팀코드에서 제외한다.
  if (labels.length >= 2 && ENV_HOST_PREFIXES.has(labels[0])) {
    return labels[1];
  }

  return labels[0];
}

/**
 * Host 문자열에서 team_cd를 해석하고 코드 상수 맵으로 team_id를 얻는다.
 * 매칭 실패 시 `DEFAULT_FALLBACK_TEAM_ID` / `gigang`으로 폴백한다.
 * 팀 UUID는 불변이라 DB 조회 없이 동기로 해석하지만, Route Handler 호출부 호환을 위해 async 시그니처를 유지한다.
 */
export async function resolveTeamContextFromHost(
  host: string | null,
): Promise<RequestTeamContext> {
  const teamCd = extractTeamCdFromHost(host);
  const teamId = TEAM_ID_BY_CD[teamCd];

  if (!teamId) {
    return { teamId: DEFAULT_FALLBACK_TEAM_ID, teamCd: "gigang" };
  }
  return { teamId, teamCd };
}

/**
 * 현재 요청의 Host 기준으로 team_cd를 해석하고, 정본 team_id를 반환한다.
 * React `cache()`로 동일 렌더 내 중복 해석을 막는다.
 */
export const getRequestTeamContext = cache(async (): Promise<RequestTeamContext> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return resolveTeamContextFromHost(host);
});
