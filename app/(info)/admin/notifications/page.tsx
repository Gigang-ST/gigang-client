import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { AdminNotificationsClient } from "./admin-notifications-client";

export const metadata = { title: "수동 알림 발송" };

export default async function AdminNotificationsPage() {
  const admin = await verifyAdmin();
  if (!admin) redirect("/admin");

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: members } = await db
    .from("team_mem_rel")
    .select("mem_id, mem_mst!inner(mem_nm)")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active")
    .order("mem_id");

  const memberList = (members ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    return {
      mem_id: row.mem_id,
      mem_nm: (mem as { mem_nm: string }).mem_nm,
    };
  });

  return <AdminNotificationsClient members={memberList} />;
}
