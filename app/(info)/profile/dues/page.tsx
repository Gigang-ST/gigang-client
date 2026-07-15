"use server";

import { redirect } from "next/navigation";

import { TEAM_ACCOUNT } from "@/lib/constants";
import { DUES_QUEST } from "@/lib/constants/dues-quest";
import { dayjs } from "@/lib/dayjs";
import { calcExemption } from "@/lib/dues/calc-exemption";
import { isMonthCharged } from "@/lib/dues/ledger-replay";
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

  const nowKst = dayjs().tz("Asia/Seoul");
  const curYm = nowKst.format("YYYY-MM");
  const todayKst = nowKst.format("YYYY-MM-DD");

  const [{ data: snap }, { data: pays }, { data: exms }, { data: otherTxns }, { data: feeItemCds }, { data: policy }, { data: activity, error: activityErr }] = await Promise.all([
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_amt, last_calc_dt, last_calc_at")
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
      .select("exm_hist_id, exm_amt, aply_ym, rsn_txt, rflt_yn, aprv_at")
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
    supabase
      .from("fee_policy_cfg")
      .select("monthly_fee_amt, aply_stt_dt, aply_end_dt")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .lte("aply_stt_dt", todayKst)
      .gte("aply_end_dt", todayKst)
      .order("aply_stt_dt", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("get_member_monthly_activity", { p_team_id: teamId, p_mem_id: member.id, p_ym: curYm }),
  ]);

  const balAmt = snap?.bal_amt ?? null;

  // 참여 감면 퀘스트(당월 실시간) — 회비 단가가 있고 활동 집계가 성공했을 때만 계산.
  // RPC 실패 시 0건으로 내려앉히면 달성 중인데 "감면 없음"으로 오표시되므로 카드 자체를 숨긴다.
  // 당월이 첫 부과월 이전(가입 당월 미부과 — JOIN_MONTH_EXEMPT_FROM 이후 가입자의 가입월)이면
  // 감면 대상이 아니므로 숨긴다 — 표시하면 마감 배치(같은 게이트)에서 제외되어 지켜지지 않는 약속이 된다.
  const monthlyFeeAmt = policy?.monthly_fee_amt ?? null;
  const chargedThisMonth = isMonthCharged(member.joined_at, curYm);
  const stat = activity?.[0] ?? { attend_cnt: 0, regular_attend_cnt: 0, hosted_cnt: 0 };
  const quest =
    monthlyFeeAmt !== null && !activityErr && chargedThisMonth
      ? {
          ym: curYm,
          result: calcExemption(
            { attendCnt: stat.attend_cnt, regularAttendCnt: stat.regular_attend_cnt, hostedCnt: stat.hosted_cnt },
            monthlyFeeAmt,
          ),
          maxAttendCnt: Math.max(...DUES_QUEST.tiers.map((t) => t.attendCnt)),
        }
      : null;

  type HistoryItem = {
    id: string;
    date: string;
    category: "due" | "exm" | "other";
    itemLabel: string;
    ioLabel: "입금" | "출금" | "면제" | "취소";
    amt: number;
    cancelled: boolean;
    note?: string | null;   // 사유(면제 rsn_txt 등)
    pending?: boolean;       // 잔액 미반영(면제 rflt_yn=false)
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
    // 면제 (날짜 = 면제가 처리된 날 aprv_at, 없으면 귀속월 1일 폴백)
    ...(exms ?? []).map((e) => ({
      id: e.exm_hist_id,
      date: e.aprv_at ? dayjs(e.aprv_at).tz("Asia/Seoul").format("YYYY-MM-DD") : e.aply_ym + "-01",
      category: "exm" as const,
      itemLabel: "회비",
      ioLabel: "면제" as const,
      amt: e.exm_amt,
      cancelled: false,
      note: e.rsn_txt,
      pending: !e.rflt_yn,   // rflt_yn=false → 아직 잔액 미반영
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
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  return (
    <DuesHistoryClient
      balAmt={balAmt}
      lastCalcDt={snap?.last_calc_dt ? dayjs(snap.last_calc_dt).tz("Asia/Seoul").format("YY.MM.DD HH:mm") : null}
      teamAccount={TEAM_ACCOUNT}
      monthlyFeeAmt={monthlyFeeAmt}
      quest={quest}
      items={items}
    />
  );
}
