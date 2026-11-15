import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";

import { AdminMileageClient } from "./admin-mileage-client";

export default async function MileagePage() {
  const { teamId } = await getRequestTeamContext();
  // 카톡 공지방 유무 — 없으면 PB 벙 열기 창이 "노티봇이 공지해요"라고 말하지 않게
  const kakaoRoomId = await getTeamCfg(teamId, "kakao.room_id");
  return <AdminMileageClient teamId={teamId} kakaoEnabled={Boolean(kakaoRoomId)} />;
}
