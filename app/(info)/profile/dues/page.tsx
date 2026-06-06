"use server";

import { redirect } from "next/navigation";

import { TEAM_ACCOUNT } from "@/lib/constants";
import { dayjs } from "@/lib/dayjs";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { DuesHistoryClient } from "./dues-history-client";

export default async function MemberDuesPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login?next=/profile/dues");
  if (!member) redirect("/onboarding?next=/profile/dues");

  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [{ data: snap }, { data: pays }, { data: exms }, { data: otherTxns }, { data: feeItemCds }] = await Promise.all([
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_amt, last_calc_dt")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle(),
    supabase
      .from("fee_due_pay_hist")
      .select("pay_id, pay_amt, pay_dt, pay_st_cd")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("pay_dt", { ascending: false })
      .limit(50),
    supabase
      .from("fee_due_exm_hist")
      .select("exm_hist_id, exm_amt, aply_ym, rsn_txt")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("aply_ym", { ascending: false })
      .limit(50),
    supabase
      .from("fee_txn_hist")
      .select("txn_id, txn_dt, txn_amt, txn_io_enm, fee_item_cd, raw_name")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("is_cfm_yn", true)
      .eq("del_yn", false)
      .neq("fee_item_cd", "due")
      .order("txn_dt", { ascending: false })
      .limit(50),
    supabase
      .from("cmm_cd_mst")
      .select("cd, cd_nm, cmm_cd_grp_mst!inner(cd_grp_cd)")
      .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
      .eq("vers", 0)
      .eq("del_yn", false),
  ]);

  const balAmt = snap?.bal_amt ?? null;

  type HistoryItem = {
    id: string;
    date: string;
    category: "due" | "exm" | "other";
    itemLabel: string;
    ioLabel: "입금" | "출금" | "면제" | "취소";
    amt: number;
    cancelled: boolean;
  };

  const itemLabelMap = new Map((feeItemCds ?? []).map((c) => [c.cd, c.cd_nm]));

  const items: HistoryItem[] = [
    // 납부·취소
    ...(pays ?? []).map((p) => ({
      id: p.pay_id,
      date: p.pay_dt,
      category: "due" as const,
      itemLabel: "회비",
      ioLabel: p.pay_st_cd === "cancelled" ? "취소" as const : "입금" as const,
      amt: p.pay_amt,
      cancelled: p.pay_st_cd === "cancelled",
    })),
    // 면제
    ...(exms ?? []).map((e) => ({
      id: e.exm_hist_id,
      date: e.aply_ym + "-01",
      category: "exm" as const,
      itemLabel: "회비",
      ioLabel: "면제" as const,
      amt: e.exm_amt,
      cancelled: false,
    })),
    // 기타 확정 거래
    ...(otherTxns ?? []).map((t) => ({
      id: t.txn_id,
      date: t.txn_dt,
      category: "other" as const,
      itemLabel: itemLabelMap.get(t.fee_item_cd ?? "") ?? t.fee_item_cd ?? "-",
      ioLabel: t.txn_io_enm === "deposit" ? "입금" as const : "출금" as const,
      amt: t.txn_amt,
      cancelled: false,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <DuesHistoryClient
      balAmt={balAmt}
      lastCalcDt={snap?.last_calc_dt ? dayjs(snap.last_calc_dt).format("YY.MM.DD") : null}
      teamAccount={TEAM_ACCOUNT}
      items={items}
    />
  );
}
