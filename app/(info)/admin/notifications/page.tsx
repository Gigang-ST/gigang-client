import { redirect } from "next/navigation";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { AdminNotificationsClient } from "./admin-notifications-client";

export const metadata = { title: "수동 알림 발송" };

const NOTI_TEMPLATES: Record<string, { notiNm: string; notiCont: string }> = {
  dues_notice: {
    notiNm: "회비 안내",
    notiCont: "[프로필] - 회비내역을 확인해 주세요.",
  },
};

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<{ memIds?: string; template?: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) redirect("/admin");

  const { memIds: memIdsParam, template } = await searchParams;
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

  const initialSelectedIds = memIdsParam ? memIdsParam.split(",").filter(Boolean) : [];
  const tmpl = template ? (NOTI_TEMPLATES[template] ?? null) : null;

  return (
    <AdminNotificationsClient
      members={memberList}
      initialSelectedIds={initialSelectedIds}
      initialNotiNm={tmpl?.notiNm ?? ""}
      initialNotiCont={tmpl?.notiCont ?? ""}
    />
  );
}
