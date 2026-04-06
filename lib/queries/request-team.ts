import { cache } from "react";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { GIGANG_TEAM_ID } from "@/lib/constants/gigang-team";

type RequestTeamContext = {
  teamId: string;
  teamCd: string;
};

const ENV_HOST_PREFIXES = new Set(["dev", "stg", "stage", "www", "preview"]);

function extractTeamCdFromHost(host: string | null): string {
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
 * 요청 Host 기준으로 team_cd를 해석하고, 정본 team_id를 반환한다.
 * 매칭 실패 시 기강 기본 팀으로 폴백한다.
 */
export const getRequestTeamContext = cache(async (): Promise<RequestTeamContext> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
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
    return { teamId: GIGANG_TEAM_ID, teamCd: "gigang" };
  }
  return { teamId: data.team_id, teamCd: data.team_cd };
});
