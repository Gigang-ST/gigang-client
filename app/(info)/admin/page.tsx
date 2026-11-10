import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";

import { AdminDashboardClient } from "./admin-dashboard-client";

/** 관리 대시보드 — 팀 설정(회비 사용 여부·카톡 공지방 유무)을 서버에서 읽어 본문에 넘긴다 */
export default async function AdminDashboardPage() {
  const { teamId } = await getRequestTeamContext();
  const [duesEnabled, kakaoRoomId] = await Promise.all([
    getTeamCfg(teamId, "feature.dues"),
    getTeamCfg(teamId, "kakao.room_id"),
  ]);
  return <AdminDashboardClient duesEnabled={duesEnabled} kakaoEnabled={Boolean(kakaoRoomId)} />;
}
