"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import dayjs from "dayjs";

export async function recalculateBalance(memId?: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  // 대상 회원 목록 결정
  let memberIds: string[];
  if (memId) {
    memberIds = [memId];
  } else {
    const { data: members } = await db
      .from("team_mem_rel")
      .select("mem_id")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active");
    memberIds = (members ?? []).map((m) => m.mem_id);
  }

  // 회비 정책 조회
  const { data: policies } = await db
    .from("fee_policy_cfg")
    .select("aply_stt_dt, aply_end_dt, monthly_fee_amt")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("aply_stt_dt", { ascending: true });

  if (!policies?.length) return { ok: false as const, message: "회비 정책이 없습니다." };

  const today = dayjs().format("YYYY-MM-DD");
  let updatedCount = 0;

  for (const mid of memberIds) {
    // 현재 스냅샷 조회
    const { data: snap } = await db
      .from("fee_mem_bal_snap")
      .select("bal_snap_id, bal_amt, last_calc_dt, vers")
      .eq("team_id", teamId)
      .eq("mem_id", mid)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();

    let baseBal = 0;
    let fromDt: string;

    if (snap) {
      baseBal = snap.bal_amt;
      fromDt = dayjs(snap.last_calc_dt).add(1, "day").format("YYYY-MM-DD");
    } else {
      // 스냅샷 없음 — 가입일부터 전체 계산
      const { data: rel } = await db
        .from("team_mem_rel")
        .select("join_dt")
        .eq("team_id", teamId)
        .eq("mem_id", mid)
        .eq("vers", 0)
        .eq("del_yn", false)
        .maybeSingle();
      if (!rel?.join_dt) continue;
      fromDt = dayjs(rel.join_dt).startOf("month").format("YYYY-MM-DD");
    }

    if (fromDt > today) continue;

    // fromDt 이후 납부액 합산
    const { data: pays } = await db
      .from("fee_due_pay_hist")
      .select("pay_amt")
      .eq("team_id", teamId)
      .eq("mem_id", mid)
      .eq("pay_st_cd", "paid")
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("pay_dt", fromDt);

    const totalPaid = (pays ?? []).reduce((sum, p) => sum + p.pay_amt, 0);

    // fromDt 이후 면제액 합산
    const { data: exms } = await db
      .from("fee_due_exm_hist")
      .select("exm_amt, aply_ym")
      .eq("team_id", teamId)
      .eq("mem_id", mid)
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("aply_ym", fromDt.slice(0, 7));

    const totalExempted = (exms ?? []).reduce((sum, e) => sum + e.exm_amt, 0);

    // fromDt 이후 부과액 계산 (월 단위)
    let totalCharged = 0;
    const fromMonth = dayjs(fromDt).startOf("month");
    const toMonth = dayjs(today).startOf("month");
    let cursor = fromMonth;
    while (!cursor.isAfter(toMonth)) {
      const ym = cursor.format("YYYY-MM-DD");
      const policy = policies
        .filter((p) => p.aply_stt_dt <= ym && p.aply_end_dt >= ym)
        .at(-1);
      if (policy) totalCharged += policy.monthly_fee_amt;
      cursor = cursor.add(1, "month");
    }

    const newBal = baseBal + totalPaid + totalExempted - totalCharged;

    // 최신 납부/면제 ID
    const lastPay = pays?.at(-1);
    const lastExm = exms?.at(-1);

    if (snap) {
      // 기존 vers=0 → max(vers)+1 로 밀기
      const { data: maxRow } = await db
        .from("fee_mem_bal_snap")
        .select("vers")
        .eq("team_id", teamId)
        .eq("mem_id", mid)
        .order("vers", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVers = (maxRow?.vers ?? 0) + 1;

      await db
        .from("fee_mem_bal_snap")
        .update({ vers: nextVers })
        .eq("bal_snap_id", snap.bal_snap_id);
    }

    // 새 vers=0 INSERT
    await db.from("fee_mem_bal_snap").insert({
      team_id: teamId,
      mem_id: mid,
      bal_amt: newBal,
      last_calc_dt: today,
      last_calc_at: new Date().toISOString(),
      last_ref_pay_id: lastPay ? undefined : undefined,
      last_ref_exm_hist_id: lastExm ? undefined : undefined,
      vers: 0,
      del_yn: false,
    });

    updatedCount++;
  }

  return { ok: true as const, message: null, updatedCount };
}
