"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";

export type AdminStats = {
  pendingCount: number;
  activeCount: number;
  totalCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다");

  const { data: me } = await supabase
    .from("member")
    .select("admin")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!me?.admin) throw new Error("권한이 없습니다");

  const admin = createAdminClient();

  const [pending, active, total, competitions, records] = await Promise.all([
    admin
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    admin.from("member").select("*", { count: "exact", head: true }),
    (() => {
      const monthStart = currentMonthKST();
      const monthEnd = nextMonthStr(monthStart);
      return admin
        .from("competition")
        .select("*", { count: "exact", head: true })
        .gte("start_date", monthStart)
        .lt("start_date", monthEnd);
    })(),
    admin
      .from("race_result")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    pendingCount: pending.count ?? 0,
    activeCount: active.count ?? 0,
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
  };
}
