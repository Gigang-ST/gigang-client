import { requireAdmin } from "@/lib/queries/member";
import { getAdminStatsData } from "@/lib/queries/admin-data";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await getAdminStatsData();
  return <AdminDashboard stats={stats} />;
}
