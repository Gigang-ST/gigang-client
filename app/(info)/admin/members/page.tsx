import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminMembersClient } from "./admin-members-client";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const { teamId } = await getRequestTeamContext();
  const { member } = await searchParams;
  return <AdminMembersClient teamId={teamId} initialTeamMemId={member} />;
}
