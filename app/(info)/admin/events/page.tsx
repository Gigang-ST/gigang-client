import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminEventsClient } from "./admin-events-client";

export default async function EventsPage() {
  const { teamId } = await getRequestTeamContext();
  return <AdminEventsClient teamId={teamId} />;
}
