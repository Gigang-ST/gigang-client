import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminProjectsClient } from "./admin-projects-client";

export default async function ProjectsPage() {
  const { teamId } = await getRequestTeamContext();
  return <AdminProjectsClient teamId={teamId} />;
}
