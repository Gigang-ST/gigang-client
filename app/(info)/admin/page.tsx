import { requireAdmin } from "@/lib/queries/admin";
import { getAdminStats } from "@/lib/queries/admin-data";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await getAdminStats();
  return <AdminDashboard stats={stats} />;
}
