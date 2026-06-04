import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import { DuesTransactionsClient } from "./dues-transactions-client";

export default async function DuesTransactionsPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [{ data: txns }, { data: uploads }, { data: members }, { data: feeItemCds }] = await Promise.all([
    supabase
      .from("fee_txn_hist")
      .select("txn_id, txn_dt, txn_amt, txn_io_enm, raw_name, raw_memo, adm_memo_txt, txn_tp_txt, match_st_cd, mem_id, fee_item_cd, is_cfm_yn, mem_mst!fk_fee_txn_hist__mem_mst(mem_nm)")
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .order("txn_dt", { ascending: false })
      .order("crt_at", { ascending: false })
      .limit(200),
    supabase
      .from("fee_xlsx_upd_hist")
      .select("upd_id, file_nm, crt_at, upd_st_cd")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("crt_at", { ascending: false })
      .limit(20),
    supabase
      .from("mem_mst")
      .select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(join_dt)")
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("team_mem_rel.vers", 0)
      .eq("team_mem_rel.del_yn", false)
      .order("mem_nm"),
    supabase
      .from("cmm_cd_mst")
      .select("cd, cd_nm, cmm_cd_grp_mst!inner(cd_grp_cd)")
      .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("sort_ord", { ascending: true }),
  ]);

  return (
    <DuesTransactionsClient
      teamId={teamId}
      txns={txns ?? []}
      uploads={uploads ?? []}
      members={(members ?? []).map((m) => ({
        mem_id: m.mem_id,
        mem_nm: m.mem_nm,
        birth_dt: m.birth_dt ?? null,
        join_dt: Array.isArray(m.team_mem_rel) ? (m.team_mem_rel[0]?.join_dt ?? null) : null,
      }))}
      feeItemCds={(feeItemCds ?? []).map((c) => ({ cd: c.cd, label: c.cd_nm }))}
    />
  );
}
