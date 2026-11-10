import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";
import { AdminMembersClient } from "./admin-members-client";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string | string[] }>;
}) {
  const { teamId } = await getRequestTeamContext();
  const { member } = await searchParams;
  const initialTeamMemId = Array.isArray(member) ? member[0] : member;
  // 회비를 안 쓰는 팀(울산)은 회비잔액 열·잔액 처리를 그리지 않는다
  const duesEnabled = await getTeamCfg(teamId, "feature.dues");
  return <AdminMembersClient teamId={teamId} initialTeamMemId={initialTeamMemId} duesEnabled={duesEnabled} />;
}
