import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { ExcludedClient } from "@/app/(info)/admin/dues/excluded/excluded-client";

export default async function DuesExcludedPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const { data: excludedTxns, error } = await supabase
    .from("fee_txn_hist")
    .select("txn_id, txn_dt, txn_tm, txn_amt, txn_io_enm, raw_name, mem_mst!fk_fee_txn_hist__mem_mst(mem_nm)")
    .eq("team_id", teamId)
    .eq("del_yn", true)
    .order("txn_dt", { ascending: false })
    .limit(200);

  // 조회 실패를 "제외된 거래 없음"으로 숨기면 운영자가 복구 대상을 잘못 판단한다.
  if (error) throw new Error(`제외 거래 조회 실패: ${error.message}`);

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
