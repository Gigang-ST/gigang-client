import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import { DuesMembersClient } from "./dues-members-client";

export default async function DuesMembersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [{ data: snaps }, { data: members }, { data: latestCfmTxns }] = await Promise.all([
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_snap_id, mem_id, bal_amt, last_calc_dt, last_calc_at")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("bal_amt", { ascending: true }),
    supabase
      .from("mem_mst")
      .select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(join_dt)")
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("team_mem_rel.vers", 0)
      .eq("team_mem_rel.del_yn", false)
      .order("mem_nm"),
    // 확정 거래 중 mem_id별 최신 cfm_at (미반영 여부 판단용)
    supabase
      .from("fee_txn_hist")
      .select("mem_id, cfm_at")
      .eq("team_id", teamId)
      .eq("is_cfm_yn", true)
      .eq("del_yn", false)
      .order("cfm_at", { ascending: false }),
  ]);

  const snapMap = new Map((snaps ?? []).map((s) => [s.mem_id, s]));

  // mem_id별 최신 cfm_at
  const latestCfmMap = new Map<string, string>();
  for (const t of latestCfmTxns ?? []) {
    if (t.mem_id && t.cfm_at && !latestCfmMap.has(t.mem_id)) {
      latestCfmMap.set(t.mem_id, t.cfm_at);
    }
  }

  const memberList = (members ?? []).map((m) => {
    const snap = snapMap.get(m.mem_id) ?? null;
    const latestCfm = latestCfmMap.get(m.mem_id) ?? null;
    const is_stale = snap && latestCfm ? latestCfm > (snap.last_calc_at ?? "") : false;
    return {
      mem_id: m.mem_id,
      mem_nm: m.mem_nm,
      birth_dt: m.birth_dt ?? null,
      join_dt: Array.isArray(m.team_mem_rel) ? (m.team_mem_rel[0]?.join_dt ?? null) : null,
      snap,
      is_stale,
    };
  });

  return <DuesMembersClient teamId={teamId} members={memberList} initialFilter={filter === "unpaid" ? "unpaid" : "all"} />;
}
