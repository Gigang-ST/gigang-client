import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { ExcludedClient } from "./excluded-client";

export default async function DuesExcludedPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const { data: excludedTxns } = await supabase
    .from("fee_txn_hist")
    .select("txn_id, txn_dt, txn_tm, txn_amt, txn_io_enm, raw_name, mem_mst!fk_fee_txn_hist__mem_mst(mem_nm)")
    .eq("team_id", teamId)
    .eq("del_yn", true)
    .order("txn_dt", { ascending: false })
    .limit(200);

  return (
    <ExcludedClient
      excludedTxns={(excludedTxns ?? []).map((t) => ({
        txn_id: t.txn_id,
        txn_dt: t.txn_dt,
        txn_tm: t.txn_tm,
        txn_amt: t.txn_amt,
        txn_io_enm: t.txn_io_enm,
        raw_name: t.raw_name,
        mem_nm: Array.isArray(t.mem_mst)
          ? (t.mem_mst[0]?.mem_nm ?? null)
          : ((t.mem_mst as { mem_nm: string } | null)?.mem_nm ?? null),
      }))}
    />
  );
}
