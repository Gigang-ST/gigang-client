import { cache } from "react";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_FALLBACK_TEAM_ID } from "@/lib/constants/gigang-team";

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
 * Host 문자열만으로 team_mst 정본을 조회해 team_id를 얻는다.
 * 매칭 실패 시 `DEFAULT_FALLBACK_TEAM_ID` / `gigang`으로 폴백한다.
 * Route Handler 등 `headers()`를 쓸 수 없을 때 사용한다.
 */
export async function resolveTeamContextFromHost(
  host: string | null,
): Promise<RequestTeamContext> {
  const teamCd = extractTeamCdFromHost(host);

  const admin = createAdminClient();
  const { data } = await admin
    .from("team_mst")
    .select("team_id, team_cd")
    .eq("team_cd", teamCd)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (!data?.team_id) {
    return { teamId: DEFAULT_FALLBACK_TEAM_ID, teamCd: "gigang" };
  }
  return { teamId: data.team_id, teamCd: data.team_cd };
}

/**
 * 현재 요청의 Host 기준으로 team_cd를 해석하고, 정본 team_id를 반환한다.
 * React `cache()`로 동일 렌더 내 중복 조회를 막는다.
 */
export const getRequestTeamContext = cache(async (): Promise<RequestTeamContext> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return resolveTeamContextFromHost(host);
});
