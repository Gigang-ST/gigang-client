"use server";

import { dayjs } from "@/lib/dayjs";

import { withAdmin } from "@/lib/actions/auth";
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
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

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
              dayjs(snap.last_calc_at).tz("Asia/Seoul").format("YYYY-MM-DD")
            )
          : await paysQuery.gte("pay_dt", fromDt);

        const filteredPays = snap?.last_calc_at
          ? (pays ?? []).filter((p) => {
              const txn = getTxnInfo(p.fee_txn_hist);
              if (!txn?.txn_dt) return false;
              const txnAt = dayjs.tz(`${txn.txn_dt}T${txn.txn_tm ?? "00:00:00"}`, "Asia/Seoul");
              return txnAt.isAfter(dayjs(snap.last_calc_at));
            })
          : (pays ?? []);

        const totalPaid = filteredPays.reduce((sum, p) => sum + p.pay_amt, 0);

        const calcFromMonth = snap
          ? dayjs(snap.last_calc_dt).add(1, "month").startOf("month")
          : dayjs(fromDt);

        const { data: exmRules } = await db
          .from("fee_due_exm_cfg")
          .select("exm_cfg_id, exm_tp_enm, exm_amt, aply_stt_dt, aply_end_dt")
          .eq("team_id", teamId)
          .eq("mem_id", mid)
          .eq("vers", 0)
          .eq("del_yn", false);

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
                // rflt_yn=false 로 생성 → 같은 재계산의 RPC가 합산·마킹(§6.2 (가)→(나) 순서)
                await db.from("fee_due_exm_hist").insert({
                  team_id: teamId,
                  mem_id: mid,
                  exm_cfg_id: rule.exm_cfg_id,
                  aply_ym: aplyYm,
                  exm_amt: exmAmt,
                  grant_src_enm: "rule_attd",
                  rsn_txt: null,
                  aprv_by_mem_id: member.id,
                  aprv_at: dayjs().toISOString(),
                  rflt_yn: false,
                  vers: 0,
                  del_yn: false,
                });
              }
            }
          }

          cursor = cursor.add(1, "month");
        }

        const { lastTxnAt, lastPay } = filteredPays.reduce<{
          lastTxnAt: string | null;
          lastPay: (typeof filteredPays)[number] | null;
        }>(
          (acc, p) => {
            const txn = getTxnInfo(p.fee_txn_hist);
            if (!txn?.txn_dt) return acc;
            const txnAt = dayjs.tz(`${txn.txn_dt}T${txn.txn_tm ?? "00:00:00"}`, "Asia/Seoul").add(1, "second").toISOString();
            return !acc.lastTxnAt || txnAt > acc.lastTxnAt ? { lastTxnAt: txnAt, lastPay: p } : acc;
          },
          { lastTxnAt: null, lastPay: null },
        );

        // 미반영(rflt_yn=false) 면제 합산 + 잔액 계산 + vers 밀기 + 스냅샷 INSERT + 면제 마킹을
        // 한 트랜잭션으로 원자화(§6.3). JS에서 나눠 호출하면 중간 실패 시 정합성이 깨진다.
        const { error: rpcErr } = await db.rpc("recalc_member_balance", {
          p_team_id: teamId,
          p_mem_id: mid,
          p_base_bal: baseBal,
          p_total_paid: totalPaid,
          p_total_charged: totalCharged,
          p_now: now.toISOString(),
          p_last_calc_at: lastTxnAt ?? snap?.last_calc_at ?? dayjs().toISOString(),
          p_last_ref_pay_id: lastPay?.pay_id ?? undefined,
        });
        if (rpcErr) { errors.push(`잔액 재계산 실패 (${mid}): ${rpcErr.message}`); return; }

        updatedCount++;
      }));
    }

    if (errors.length) return { ok: false as const, message: errors.join("\n") };
    return { ok: true as const, message: null, updatedCount };
  });
}
