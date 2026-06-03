import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import { DuesMembersClient } from "./dues-members-client";

export default async function DuesMembersPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [{ data: snaps }, { data: members }] = await Promise.all([
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_snap_id, mem_id, bal_amt, last_calc_dt")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("bal_amt", { ascending: true }),
    supabase
      .from("mem_mst")
      .select("mem_id, mem_nm")
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("mem_nm"),
  ]);

  const snapMap = new Map((snaps ?? []).map((s) => [s.mem_id, s]));

  const memberList = (members ?? []).map((m) => ({
    ...m,
    snap: snapMap.get(m.mem_id) ?? null,
  }));

  return <DuesMembersClient teamId={teamId} members={memberList} />;
}
