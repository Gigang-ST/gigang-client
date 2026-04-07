import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminMembersClient } from "./admin-members-client";

export default async function MembersPage() {
  const { teamId } = await getRequestTeamContext();
  return <AdminMembersClient teamId={teamId} />;
}
