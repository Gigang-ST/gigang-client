import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminMembersClient } from "./admin-members-client";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string | string[] }>;
}) {
  const { teamId } = await getRequestTeamContext();
  const { member } = await searchParams;
  const initialTeamMemId = Array.isArray(member) ? member[0] : member;
  return <AdminMembersClient teamId={teamId} initialTeamMemId={initialTeamMemId} />;
}
