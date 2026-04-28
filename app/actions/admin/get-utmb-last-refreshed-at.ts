"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export type UtmbRefreshMeta = {
  lastRefreshedAt: string | null;
  memberCount: number;
};

export async function getUtmbLastRefreshedAt(): Promise<UtmbRefreshMeta> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const { teamId } = await getRequestTeamContext();
  const admin = createAdminClient();

  const { data: teamMembers, error: teamErr } = await admin
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (teamErr) {
    console.error("[getUtmbLastRefreshedAt] team error:", teamErr);
    return { lastRefreshedAt: null, memberCount: 0 };
  }

  const memIds = (teamMembers ?? []).map((r) => r.mem_id);
  if (memIds.length === 0) {
    return { lastRefreshedAt: null, memberCount: 0 };
  }

  const { data, error, count } = await admin
    .from("mem_utmb_prf")
    .select("upd_at", { count: "exact" })
    .in("mem_id", memIds)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("upd_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[getUtmbLastRefreshedAt] error:", error);
    return { lastRefreshedAt: null, memberCount: 0 };
  }

  return {
    lastRefreshedAt: data?.[0]?.upd_at ?? null,
    memberCount: count ?? 0,
  };
}
