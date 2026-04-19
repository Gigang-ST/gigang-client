import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminApprovalsClient } from "./admin-approvals-client";

export default async function ApprovalsPage() {
  const { teamId } = await getRequestTeamContext();
  return <AdminApprovalsClient teamId={teamId} />;
}
