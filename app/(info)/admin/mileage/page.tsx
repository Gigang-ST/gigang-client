import { getRequestTeamContext } from "@/lib/queries/request-team";
import { AdminMileageClient } from "./admin-mileage-client";

export default async function MileagePage() {
  const { teamId } = await getRequestTeamContext();
  return <AdminMileageClient teamId={teamId} />;
}
