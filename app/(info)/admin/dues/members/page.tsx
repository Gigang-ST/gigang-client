import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { DuesMembersClient } from "./dues-members-client";

export default async function DuesMembersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [{ data: snaps }, { data: members }, { data: latestCfmTxns }, { data: payHists }] = await Promise.all([
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_snap_id, mem_id, bal_amt, last_calc_dt, last_calc_at")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("bal_amt", { ascending: true }),
    supabase
      .from("mem_mst")
      .select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(join_dt, mem_st_cd, inact_rsn_txt)")
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
    // 납부 원장
    supabase
      .from("fee_due_pay_hist")
      .select("pay_id, mem_id, pay_amt, pay_dt, pay_st_cd, fee_txn_hist!inner(fee_item_cd, raw_name), mem_mst!inner(mem_nm)")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("pay_dt", { ascending: false }),
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
    const rel = Array.isArray(m.team_mem_rel) ? m.team_mem_rel[0] : m.team_mem_rel;
    return {
      mem_id: m.mem_id,
      mem_nm: m.mem_nm,
      birth_dt: m.birth_dt ?? null,
      join_dt: (rel as { join_dt?: string | null } | null)?.join_dt ?? null,
      mem_st_cd: (rel as { mem_st_cd?: string | null } | null)?.mem_st_cd ?? "active",
      inact_rsn_txt: (rel as { inact_rsn_txt?: string | null } | null)?.inact_rsn_txt ?? null,
      snap,
      is_stale,
    };
  });

  const payHistList = (payHists ?? []).map((p) => ({
    pay_id: p.pay_id,
    mem_id: p.mem_id,
    mem_nm: Array.isArray(p.mem_mst) ? (p.mem_mst[0]?.mem_nm ?? "-") : ((p.mem_mst as { mem_nm: string } | null)?.mem_nm ?? "-"),
    pay_amt: p.pay_amt,
    pay_dt: p.pay_dt,
    pay_st_cd: p.pay_st_cd as "paid" | "cancelled" | "refunded",
    fee_item_cd: Array.isArray(p.fee_txn_hist) ? (p.fee_txn_hist[0]?.fee_item_cd ?? null) : ((p.fee_txn_hist as { fee_item_cd: string } | null)?.fee_item_cd ?? null),
    raw_name: Array.isArray(p.fee_txn_hist) ? (p.fee_txn_hist[0]?.raw_name ?? "-") : ((p.fee_txn_hist as { raw_name: string } | null)?.raw_name ?? "-"),
  }));

  return <DuesMembersClient teamId={teamId} members={memberList} payHists={payHistList} initialFilter={filter === "unpaid" ? "unpaid" : "all"} />;
}
