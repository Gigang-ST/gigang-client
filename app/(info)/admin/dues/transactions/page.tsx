import { dayjs } from "@/lib/dayjs";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { DuesTransactionsClient } from "./dues-transactions-client";

export default async function DuesTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string; balFilter?: string }>;
}) {
  const { tab, filter, balFilter } = await searchParams;
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [
    { data: txns },
    { data: uploads },
    { data: members },
    { data: feeItemCds },
    { data: snaps },
    { data: latestCfmTxns },
    { data: payHists },
  ] = await Promise.all([
    supabase
      .from("fee_txn_hist")
      .select("txn_id, txn_dt, txn_tm, txn_amt, txn_io_enm, raw_name, raw_memo, adm_memo_txt, txn_tp_txt, match_st_cd, mem_id, fee_item_cd, is_cfm_yn, cfm_at, mem_mst!fk_fee_txn_hist__mem_mst(mem_nm)")
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
      .select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(join_dt, mem_st_cd, inact_rsn_txt)")
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
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_snap_id, mem_id, bal_amt, last_calc_dt, last_calc_at")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("bal_amt", { ascending: true }),
    supabase
      .from("fee_txn_hist")
      .select("mem_id, txn_dt, txn_tm")
      .eq("team_id", teamId)
      .eq("is_cfm_yn", true)
      .eq("del_yn", false)
      .order("txn_dt", { ascending: false })
      .order("txn_tm", { ascending: false }),
    supabase
      .from("fee_due_pay_hist")
      .select("pay_id, mem_id, pay_amt, pay_dt, pay_st_cd, fee_txn_hist!inner(fee_item_cd, raw_name), mem_mst!inner(mem_nm)")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("pay_dt", { ascending: false }),
  ]);

  // 거래 미반영 판단: snap last_calc_at vs 은행 거래일시 기준
  const snapCalcAtMap = new Map((snaps ?? []).map((s) => [s.mem_id, s.last_calc_at]));

  // 회원별 잔액 데이터
  const snapMap = new Map((snaps ?? []).map((s) => [s.mem_id, s]));
  const latestTxnAtMap = new Map<string, string>();
  for (const t of latestCfmTxns ?? []) {
    if (t.mem_id && t.txn_dt && !latestTxnAtMap.has(t.mem_id)) {
      latestTxnAtMap.set(
        t.mem_id,
        dayjs.tz(`${t.txn_dt}T${t.txn_tm ?? "00:00:00"}`, "Asia/Seoul").toISOString(),
      );
    }
  }

  const memberRows = (members ?? []).map((m) => {
    const snap = snapMap.get(m.mem_id) ?? null;
    const latestTxnAt = latestTxnAtMap.get(m.mem_id) ?? null;
    const is_stale = !snap || (!!latestTxnAt && latestTxnAt > (snap.last_calc_at ?? ""));
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
    mem_nm: Array.isArray(p.mem_mst)
      ? (p.mem_mst[0]?.mem_nm ?? "-")
      : ((p.mem_mst as { mem_nm: string } | null)?.mem_nm ?? "-"),
    pay_amt: p.pay_amt,
    pay_dt: p.pay_dt,
    pay_st_cd: p.pay_st_cd as "paid" | "cancelled",
    fee_item_cd: Array.isArray(p.fee_txn_hist)
      ? (p.fee_txn_hist[0]?.fee_item_cd ?? null)
      : ((p.fee_txn_hist as { fee_item_cd: string } | null)?.fee_item_cd ?? null),
    raw_name: Array.isArray(p.fee_txn_hist)
      ? (p.fee_txn_hist[0]?.raw_name ?? "-")
      : ((p.fee_txn_hist as { raw_name: string } | null)?.raw_name ?? "-"),
  }));

  const validTabs = ["upload", "txn", "balance", "pays"] as const;
  type TabType = typeof validTabs[number];
  const initialTab: TabType = validTabs.includes(tab as TabType) ? (tab as TabType) : "upload";

  const validTxnFilters = ["all", "unconfirmed", "confirmed"] as const;
  type TxnFilterType = typeof validTxnFilters[number];
  const initialTxnFilter: TxnFilterType = validTxnFilters.includes(filter as TxnFilterType)
    ? (filter as TxnFilterType)
    : "all";

  const initialBalFilter = balFilter === "unpaid" ? "unpaid" : "all";

  return (
    <DuesTransactionsClient
      txns={(txns ?? []).map((t) => ({
        ...t,
        is_stale:
          t.is_cfm_yn && !!t.txn_dt && !!t.mem_id
            ? dayjs.tz(`${t.txn_dt}T${t.txn_tm ?? "00:00:00"}`, "Asia/Seoul").toISOString() >
              (snapCalcAtMap.get(t.mem_id!) ?? "")
            : false,
      }))}
      uploads={uploads ?? []}
      members={(members ?? []).map((m) => {
        const rel = Array.isArray(m.team_mem_rel) ? m.team_mem_rel[0] : m.team_mem_rel;
        return {
          mem_id: m.mem_id,
          mem_nm: m.mem_nm,
          birth_dt: m.birth_dt ?? null,
          join_dt: (rel as { join_dt?: string | null } | null)?.join_dt ?? null,
        };
      })}
      memberRows={memberRows}
      payHists={payHistList}
      feeItemCds={(feeItemCds ?? []).map((c) => ({ cd: c.cd, label: c.cd_nm }))}
      initialTab={initialTab}
      initialTxnFilter={initialTxnFilter}
      initialBalFilter={initialBalFilter as "all" | "unpaid"}
    />
  );
}
