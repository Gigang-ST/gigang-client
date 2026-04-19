import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminParticipationsClient } from "./admin-participations-client";

export default async function ParticipationsPage() {
  const { teamId } = await getRequestTeamContext();
  return <AdminParticipationsClient teamId={teamId} />;
}
