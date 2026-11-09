import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";

import { AdminDashboardClient } from "./admin-dashboard-client";

/** 관리 대시보드 — 팀 설정(회비 사용 여부 등)을 서버에서 읽어 본문에 넘긴다 */
export default async function AdminDashboardPage() {
  const { teamId } = await getRequestTeamContext();
  const duesEnabled = await getTeamCfg(teamId, "feature.dues");
  return <AdminDashboardClient duesEnabled={duesEnabled} />;
}
