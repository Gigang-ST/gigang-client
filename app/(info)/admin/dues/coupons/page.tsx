import { listCouponsCore } from "@/lib/coupon/core";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import { CouponsClient } from "./coupons-client";

export default async function AdminCouponsPage() {
  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const [coupons, members] = await Promise.all([
    listCouponsCore(db, { teamId }),
    fetchAllRows<{ mem_id: string; mem_nm: string; birth_dt: string | null }>(() =>
      db
        .from("mem_mst")
        .select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(team_id)")
        .eq("vers", 0)
        .eq("del_yn", false)
        .eq("team_mem_rel.team_id", teamId)
        .eq("team_mem_rel.vers", 0)
        .eq("team_mem_rel.del_yn", false)
        .order("mem_id"),
    ),
  ]);

  const memberOptions = members
    .map((m) => ({ memId: m.mem_id, name: m.mem_nm, birthDt: m.birth_dt ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return <CouponsClient coupons={coupons} members={memberOptions} />;
}
