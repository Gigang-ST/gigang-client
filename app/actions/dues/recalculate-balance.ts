"use server";

import { dayjs } from "@/lib/dayjs";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

type TxnInfo = { txn_dt: string; txn_tm: string | null } | null;

function getTxnInfo(raw: unknown): TxnInfo {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  return item as TxnInfo;
}

export async function recalculateBalance(memIds?: string[]) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  // 대상 회원 목록 결정
  let memberIds: string[];
  if (memIds && memIds.length > 0) {
    memberIds = memIds;
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

  const now = dayjs().tz("Asia/Seoul");
  const today = now.format("YYYY-MM-DD");
  let updatedCount = 0;
  const errors: string[] = [];

  const CHUNK_SIZE = 20;
  for (let i = 0; i < memberIds.length; i += CHUNK_SIZE) {
    const chunk = memberIds.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (mid) => {
    // 현재 스냅샷 조회
    const { data: snap } = await db
      .from("fee_mem_bal_snap")
      .select("bal_snap_id, bal_amt, last_calc_dt, last_calc_at, vers")
      .eq("team_id", teamId)
      .eq("mem_id", mid)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();

    let baseBal = 0;
    let fromDt: string;

    if (snap) {
      baseBal = snap.bal_amt;
      fromDt = dayjs(snap.last_calc_dt).format("YYYY-MM-DD");
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
      if (!rel?.join_dt) return;
      fromDt = dayjs(rel.join_dt).startOf("month").format("YYYY-MM-DD");
    }

      if (fromDt > today) return;

    // 마지막 계산일시 이후 납부액 합산 (은행 거래일시 기준)
    const paysQuery = db
      .from("fee_due_pay_hist")
      .select("pay_id, pay_amt, fee_txn_hist!fk_fee_due_pay_hist__fee_txn_hist(txn_dt, txn_tm)")
      .eq("team_id", teamId)
      .eq("mem_id", mid)
      .eq("pay_st_cd", "paid")
      .eq("vers", 0)
      .eq("del_yn", false);

    const { data: pays } = snap?.last_calc_at
      ? await paysQuery.gte(
          "fee_txn_hist.txn_dt",
          // 1차: KST 날짜 기준 넓게 필터, 2차 코드에서 시분까지 정확히 필터
          dayjs(snap.last_calc_at).tz("Asia/Seoul").format("YYYY-MM-DD")
        )
      : await paysQuery.gte("pay_dt", fromDt);

    // txn_dt + txn_tm으로 2차 필터 (last_calc_at 이후만, KST 기준 비교)
    const filteredPays = snap?.last_calc_at
      ? (pays ?? []).filter((p) => {
          const txn = getTxnInfo(p.fee_txn_hist);
          if (!txn?.txn_dt) return false;
          const txnAt = dayjs.tz(`${txn.txn_dt}T${txn.txn_tm ?? "00:00:00"}`, "Asia/Seoul");
          return txnAt.isAfter(dayjs(snap.last_calc_at));
        })
      : (pays ?? []);

    const totalPaid = filteredPays.reduce((sum, p) => sum + p.pay_amt, 0);

    // 부과·면제 기준 월: 마지막 계산 월 다음 달부터
    const calcFromMonth = snap
      ? dayjs(snap.last_calc_dt).add(1, "month").startOf("month")
      : dayjs(fromDt);
    const exmFromYm = snap
      ? dayjs(snap.last_calc_dt).add(1, "month").format("YYYY-MM")
      : fromDt.slice(0, 7);

    // 이 회원의 유효한 면제 규칙 조회
    const { data: exmRules } = await db
      .from("fee_due_exm_cfg")
      .select("exm_cfg_id, exm_tp_enm, exm_amt, aply_stt_dt, aply_end_dt")
      .eq("team_id", teamId)
      .eq("mem_id", mid)
      .eq("vers", 0)
      .eq("del_yn", false);

    // 부과 계산 + 규칙 기반 면제 이력 생성 (월별 루프)
    let totalCharged = 0;
    const toMonth = dayjs(today).startOf("month");
    let cursor = calcFromMonth;
    while (!cursor.isAfter(toMonth)) {
      const ym = cursor.format("YYYY-MM-DD");
      const aplyYm = cursor.format("YYYY-MM");

      const policy = policies
        .filter((p) => p.aply_stt_dt <= ym && p.aply_end_dt >= ym)
        .at(-1);
      if (policy) {
        totalCharged += policy.monthly_fee_amt;

        // 이 달에 적용되는 면제 규칙 → rule_attd 이력 생성 (중복 방지)
        const rule = (exmRules ?? []).find((r) => r.aply_stt_dt <= ym && r.aply_end_dt >= ym);
        if (rule) {
          const exmAmt = rule.exm_tp_enm === "full" ? policy.monthly_fee_amt : (rule.exm_amt ?? 0);
          const { data: existing } = await db
            .from("fee_due_exm_hist")
            .select("exm_hist_id")
            .eq("team_id", teamId)
            .eq("mem_id", mid)
            .eq("aply_ym", aplyYm)
            .eq("exm_cfg_id", rule.exm_cfg_id)
            .eq("del_yn", false)
            .maybeSingle();

          if (!existing) {
            await db.from("fee_due_exm_hist").insert({
              team_id: teamId,
              mem_id: mid,
              exm_cfg_id: rule.exm_cfg_id,
              aply_ym: aplyYm,
              exm_amt: exmAmt,
              grant_src_enm: "rule_attd",
              rsn_txt: null,
              aprv_by_mem_id: adminUser.id,
              aprv_at: dayjs().toISOString(),
              vers: 0,
              del_yn: false,
            });
          }
        }
      }

      cursor = cursor.add(1, "month");
    }

    // 전체 면제 이력 합산 (rule_attd 포함, 이미 이력으로 적재됨)
    const { data: exms } = await db
      .from("fee_due_exm_hist")
      .select("exm_hist_id, exm_amt, aply_ym")
      .eq("team_id", teamId)
      .eq("mem_id", mid)
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("aply_ym", exmFromYm)
      .order("aply_ym", { ascending: false });

    const totalExempted = (exms ?? []).reduce((sum, e) => sum + e.exm_amt, 0);

    const newBal = baseBal + totalPaid + totalExempted - totalCharged;

    // 마지막 반영 거래의 은행 거래일시 (KST 기준, +1초 저장 → 다음 계산 시 중복 방지)
    const lastTxnAt = filteredPays.reduce<string | null>((latest, p) => {
      const txn = getTxnInfo(p.fee_txn_hist);
      if (!txn?.txn_dt) return latest;
      const txnAt = dayjs.tz(`${txn.txn_dt}T${txn.txn_tm ?? "00:00:00"}`, "Asia/Seoul").add(1, "second").toISOString();
      return !latest || txnAt > latest ? txnAt : latest;
    }, null);

    const lastPay = filteredPays.at(-1);
    const lastExm = exms?.at(0);

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

      const { error: pushErr } = await db
        .from("fee_mem_bal_snap")
        .update({ vers: nextVers })
        .eq("bal_snap_id", snap.bal_snap_id);
      if (pushErr) { errors.push(`스냅샷 버전 밀기 실패 (${mid}): ${pushErr.message}`); return; }
    }

    // 새 vers=0 INSERT
    const { error: insertErr } = await db.from("fee_mem_bal_snap").insert({
      team_id: teamId,
      mem_id: mid,
      bal_amt: newBal,
      last_calc_dt: now.toISOString(),
      last_calc_at: lastTxnAt ?? snap?.last_calc_at ?? dayjs().toISOString(),
      last_ref_pay_id: lastPay?.pay_id ?? undefined,
      last_ref_exm_hist_id: lastExm?.exm_hist_id ?? undefined,
      vers: 0,
      del_yn: false,
    });
      if (insertErr) { errors.push(`스냅샷 INSERT 실패 (${mid}): ${insertErr.message}`); return; }

      updatedCount++;
    }));
  }

  if (errors.length) return { ok: false as const, message: errors.join("\n") };
  return { ok: true as const, message: null, updatedCount };
}
