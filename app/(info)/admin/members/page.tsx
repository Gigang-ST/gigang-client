import { requireAdmin } from "@/lib/queries/member";
import { getAllMembers } from "@/lib/queries/admin-data";
import { MembersList } from "@/components/admin/members-list";

export default async function MembersPage() {
  await requireAdmin();
  const members = await getAllMembers();
  return <MembersList initialMembers={members} />;
}
