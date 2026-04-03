import { requireAdmin } from "@/lib/queries/member";
import { getPendingMembers } from "@/lib/queries/admin-data";
import { ApprovalsList } from "@/components/admin/approvals-list";

export default async function ApprovalsPage() {
  await requireAdmin();
  const members = await getPendingMembers();
  return <ApprovalsList initialMembers={members} />;
}
