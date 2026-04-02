import { requireAdmin } from "@/lib/queries/admin";
import { getAllCompetitions } from "@/lib/queries/admin-data";
import { CompetitionsManager } from "@/components/admin/competitions-manager";

export default async function CompetitionsPage() {
  await requireAdmin();
  const competitions = await getAllCompetitions();
  return <CompetitionsManager initialCompetitions={competitions} />;
}
