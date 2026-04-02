import { requireAdmin } from "@/lib/queries/admin";
import { getAllRecords } from "@/lib/queries/admin-data";
import { RecordsManager } from "@/components/admin/records-manager";

export default async function RecordsPage() {
  await requireAdmin();
  const records = await getAllRecords();
  return <RecordsManager initialRecords={records} />;
}
