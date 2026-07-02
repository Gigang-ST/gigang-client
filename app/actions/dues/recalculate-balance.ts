"use server";

import { dayjs } from "@/lib/dayjs";

import { withAdmin } from "@/lib/actions/auth";
import {
  LEDGER_EPOCH,
  buildChargeMonths,
  replayPays,
  type ReplayPay,
} from "@/lib/dues/ledger-replay";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

type TxnInfo = { txn_dt: string; txn_tm: string | null } | null;

function getTxnInfo(raw: unknown): TxnInfo {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  return item as TxnInfo;
}

/**
 * 회원 잔액 재계산 — 앵커(개시잔액) + 전체 리플레이 방식.
 *
 * bal = 앵커잔액 + Σ납부(앵커 커서 이후, paid만) + Σ면제 − Σ부과(앵커 다음달~당월).
 *
 * 앵커는 LEDGER_EPOCH 이전에 만들어진 가장 오래된 스냅샷(컷오버 시딩 등 pay_hist 로
 * 재구성 불가능한 개시잔액)만 인정하고, 그 이후 스냅샷은 파생 캐시로 취급해 매번
 * 앵커부터 다시 계산한다. 직전 스냅샷을 기점으로 하는 증분(커서) 방식은 커서 이전
 * 시점의 늦은 확정·확정취소를 영영 반영하지 못하는 구멍이 있었다(QS-4 계열) —
 * 리플레이는 몇 번을 돌려도 원천 데이터와 일치하므로(멱등) 취소·재확정 후에도
 * 이 함수 한 번이면 잔액이 복구된다. 팀 규모(수십 명×월 수십 건)에서 비용 무시 가능.
 *
 * RPC(recalc_member_balance) 계약 유지: p_base_bal 에 "앵커잔액 + 이미 반영된
 * (rflt_yn=true) 면제 합"을 넣으면, RPC 가 미반영(rflt_yn=false) 면제를 원자적으로
 * 합산·마킹한다 → 합치면 전체 면제가 정확히 한 번씩 반영된다.
 */
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
        // ① 앵커 — LEDGER_EPOCH 이전에 만들어진 가장 오래된 스냅샷(개시잔액)
        const { data: anchor } = await db
          .from("fee_mem_bal_snap")
          .select("bal_amt, last_calc_dt, last_calc_at")
          .eq("team_id", teamId)
          .eq("mem_id", mid)
          .eq("del_yn", false)
          .lt("crt_at", dayjs(LEDGER_EPOCH).toISOString())
          .order("crt_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        // ② 부과 시작 월 — 앵커가 있으면 앵커 마감월 다음 달, 없으면 가입월
        let fromMonth: string;
        if (anchor) {
          fromMonth = dayjs(anchor.last_calc_dt).add(1, "month").startOf("month").format("YYYY-MM-DD");
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
          fromMonth = dayjs(rel.join_dt).startOf("month").format("YYYY-MM-DD");
        }

        // ③ 납부 리플레이 — paid 전체를 읽고 앵커 커서 이후만 합산
        const { data: pays } = await db
          .from("fee_due_pay_hist")
          .select("pay_id, pay_amt, pay_dt, fee_txn_hist!fk_fee_due_pay_hist__fee_txn_hist(txn_dt, txn_tm)")
          .eq("team_id", teamId)
          .eq("mem_id", mid)
          .eq("pay_st_cd", "paid")
          .eq("vers", 0)
          .eq("del_yn", false);

        const replayInput: ReplayPay[] = (pays ?? []).map((p) => {
          const txn = getTxnInfo(p.fee_txn_hist);
          const at = txn?.txn_dt
            ? dayjs.tz(`${txn.txn_dt}T${txn.txn_tm ?? "00:00:00"}`, "Asia/Seoul")
            : dayjs.tz(`${p.pay_dt}T00:00:00`, "Asia/Seoul");
          return {
            payId: p.pay_id,
            payAmt: p.pay_amt,
            txnAt: at.toISOString(),
            fromBankTxn: !!txn?.txn_dt,
          };
        });
        const { totalPaid, lastTxnAt, lastPayId } = replayPays(
          replayInput,
          anchor?.last_calc_at ?? null,
        );

        // ④ 부과 + 규칙 면제 매칭 (리플레이 구간 전체 — 존재 확인으로 멱등)
        const { data: exmRules } = await db
          .from("fee_due_exm_cfg")
          .select("exm_cfg_id, exm_tp_enm, exm_amt, aply_stt_dt, aply_end_dt")
          .eq("team_id", teamId)
          .eq("mem_id", mid)
          .eq("vers", 0)
          .eq("del_yn", false);

        const months = fromMonth <= today
          ? buildChargeMonths(policies, exmRules ?? [], fromMonth, today)
          : [];
        const totalCharged = months.reduce((sum, m) => sum + m.charged, 0);

        for (const m of months) {
          if (!m.exm) continue;
          const { data: existing } = await db
            .from("fee_due_exm_hist")
            .select("exm_hist_id")
            .eq("team_id", teamId)
            .eq("mem_id", mid)
            .eq("aply_ym", m.aplyYm)
            .eq("exm_cfg_id", m.exm.exmCfgId)
            .eq("del_yn", false)
            .maybeSingle();

          if (!existing) {
            // rflt_yn=false 로 생성 → 같은 재계산의 RPC가 합산·마킹(§6.2 (가)→(나) 순서)
            const { error: exmInsErr } = await db.from("fee_due_exm_hist").insert({
              team_id: teamId,
              mem_id: mid,
              exm_cfg_id: m.exm.exmCfgId,
              aply_ym: m.aplyYm,
              exm_amt: m.exm.exmAmt,
              grant_src_enm: "rule_attd",
              rsn_txt: null,
              aprv_by_mem_id: member.id,
              aprv_at: dayjs().toISOString(),
              rflt_yn: false,
              vers: 0,
              del_yn: false,
            });
            // 23505 = 동시 재계산이 먼저 적재함(uk_fee_exm_hist_rule) — 이중 반영 방지가
            // 목적이므로 무시. 그 외 에러는 면제 누락으로 이어지므로 표면화한다.
            if (exmInsErr && exmInsErr.code !== "23505") {
              errors.push(`면제 적재 실패 (${mid} ${m.aplyYm}): ${exmInsErr.message}`);
              return;
            }
          }
        }

        // ⑤ 이미 반영(rflt_yn=true)된 면제 합 — base 에 녹여 RPC의 미반영 합산과 합치면 전체
        const { data: reflectedExms } = await db
          .from("fee_due_exm_hist")
          .select("exm_amt")
          .eq("team_id", teamId)
          .eq("mem_id", mid)
          .eq("rflt_yn", true)
          .eq("del_yn", false);
        const reflectedExmSum = (reflectedExms ?? []).reduce((sum, e) => sum + e.exm_amt, 0);

        const baseBal = (anchor?.bal_amt ?? 0) + reflectedExmSum;

        // ⑥ 새 커서 — 리플레이한 마지막 거래 시각. 납부가 없으면 앵커 커서, 그마저 없으면
        //    가입월 초. now 로 두면 과거 입금이 업로드 컷오프에 걸려 조용히 소실된다(QS-9).
        const newCursor =
          lastTxnAt ?? anchor?.last_calc_at ?? dayjs.tz(`${fromMonth}T00:00:00`, "Asia/Seoul").toISOString();

        const { error: rpcErr } = await db.rpc("recalc_member_balance", {
          p_team_id: teamId,
          p_mem_id: mid,
          p_base_bal: baseBal,
          p_total_paid: totalPaid,
          p_total_charged: totalCharged,
          p_now: now.toISOString(),
          p_last_calc_at: newCursor,
          p_last_ref_pay_id: lastPayId ?? undefined,
        });
        if (rpcErr) { errors.push(`잔액 재계산 실패 (${mid}): ${rpcErr.message}`); return; }

        updatedCount++;
      }));
    }

    if (errors.length) return { ok: false as const, message: errors.join("\n") };
    return { ok: true as const, message: null, updatedCount };
  });
}
