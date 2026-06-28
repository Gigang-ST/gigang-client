"use server";

import { withAdminOrThrow } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { calcExemption } from "@/lib/dues/calc-exemption";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

const KST = "Asia/Seoul";

/**
 * 참여 기반 회비 감면 배치 — 월 마감 후 전월 참여 감면을 면제 내역에 확정(설계 §8).
 *
 * - 대상 월: 기본 전월(baseMonth 미지정 시). 'YYYY-MM' 지정 가능(과거 소급).
 * - 대상 멤버: 대상 월에 활성이던 팀 멤버(가입월 ≤ 대상월).
 * - 멤버별 get_member_monthly_activity(team, mem, ym) → calcExemption(대상월 회비단가).
 * - exmAmt>0 이면 grant_src_enm='rule_attd_quest', rflt_yn=false 로 INSERT.
 *   멱등: 같은 월 퀘스트 면제가 이미 있으면 스킵(존재 확인 후 INSERT). 부분 유니크 인덱스
 *   uk_fee_exm_hist_quest 가 동시성 경합 시 최종 방어선.
 * - 잔액 반영은 안 함. 다음 재계산이 rflt_yn=false 를 합산·마킹(§6).
 * - 마감 후 회수 없음: exmAmt==0 이면 아무것도 안 함(회수 분기 없음, §6.4/§8.1).
 *
 * ⚠️ 성능: 멤버당 집계 RPC 1회 호출(N+1). 월 1회·수백 명 규모라 허용. 멤버 수가 크게 늘면
 *   집계를 셋 기반(멤버 전체 1회) RPC로 승급(설계 §4.2). 현재는 단순성 우선.
 */
export async function batchDuesExemption(baseMonth?: string): Promise<string> {
  return withAdminOrThrow(async ({ member }) => {
    const db = createAdminClient();
    const { teamId } = await getRequestTeamContext();

    const ym = baseMonth ? dayjs(baseMonth).format("YYYY-MM") : dayjs().tz(KST).subtract(1, "month").format("YYYY-MM");
    // 입력 오류·정책 위반은 throw → 배치 이력이 status='failed'로 기록되고 toast.error로 노출(success 오표기 방지).
    if (ym === "Invalid Date") throw new Error("대상 월 형식이 올바르지 않습니다(YYYY-MM).");

    // 당월·미래월 차단: 배치는 "월 마감 후 전월 확정"만 한다(설계 §8.3).
    // 진행 중인 달을 확정하면 이후 참석 증감을 면제 내역에 반영했다 회수하는 혼란이 생긴다.
    const curYm = dayjs().tz(KST).format("YYYY-MM");
    if (ym >= curYm) throw new Error(`진행 중이거나 미래인 달(${ym})은 확정할 수 없습니다. 마감된 전월 이하만 가능합니다.`);

    const monthStart = `${ym}-01`;
    const monthEnd = dayjs(monthStart).tz(KST).endOf("month").format("YYYY-MM-DD");

    // 대상 월 회비 단가 (소급 정확성: 현재 단가가 아니라 그 달에 적용되던 단가)
    const { data: policies } = await db
      .from("fee_policy_cfg")
      .select("aply_stt_dt, aply_end_dt, monthly_fee_amt")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("aply_stt_dt", { ascending: true });

    const policy = (policies ?? []).filter((p) => p.aply_stt_dt <= monthEnd && p.aply_end_dt >= monthStart).at(-1);
    if (!policy) return `대상 월(${ym})에 적용되는 회비 정책이 없습니다.`;
    const monthlyFeeAmt = policy.monthly_fee_amt;

    // 대상 멤버: 대상 월에 활성이던 멤버(가입월 ≤ 대상월)
    const { data: members } = await db
      .from("team_mem_rel")
      .select("mem_id, join_dt")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active");

    const targets = (members ?? []).filter((m) => m.join_dt && dayjs(m.join_dt).format("YYYY-MM") <= ym);
    if (!targets.length) return `대상 멤버가 없습니다 (대상 월: ${ym}).`;

    let granted = 0;
    let skippedZero = 0;
    let alreadyGranted = 0;
    const errors: string[] = [];

    for (const m of targets) {
      const { data: statRows, error: statErr } = await db.rpc("get_member_monthly_activity", {
        p_team_id: teamId,
        p_mem_id: m.mem_id,
        p_ym: ym,
      });
      if (statErr) { errors.push(`${m.mem_id} 집계 실패: ${statErr.message}`); continue; }

      const stat = statRows?.[0] ?? { attend_cnt: 0, regular_attend_cnt: 0, hosted_cnt: 0 };
      const result = calcExemption(
        { attendCnt: stat.attend_cnt, regularAttendCnt: stat.regular_attend_cnt, hostedCnt: stat.hosted_cnt },
        monthlyFeeAmt,
      );

      if (result.exmAmt <= 0) { skippedZero++; continue; }

      // 사유: "[5월 회비 감면] 참여 4회 (정모 참여)" 형태 — 회원이 어느 달 무엇으로 감면됐는지 명확히
      const monthLabel = dayjs(monthStart).format("M월");
      const gateLabel = stat.regular_attend_cnt > 0 ? "정모 참여" : "벙 개설";
      const rsnTxt = `[${monthLabel} 회비 감면] 참여 ${stat.attend_cnt}회 (${gateLabel})`;

      // 멱등: 이미 같은 월 퀘스트 면제가 있으면 그대로 둠(확정값은 재계산이 금액을 바꾸지 않음).
      // ※ uk_fee_exm_hist_quest 는 부분(partial) 유니크 인덱스라 PostgREST upsert 의 onConflict
      //   타겟으로 추론되지 않는다 → 존재 확인 후 INSERT 패턴(재계산 규칙 면제와 동일).
      //   인덱스는 동시성 경합 시 최종 방어선으로 남는다.
      const { data: existing } = await db
        .from("fee_due_exm_hist")
        .select("exm_hist_id")
        .eq("team_id", teamId)
        .eq("mem_id", m.mem_id)
        .eq("aply_ym", ym)
        .eq("grant_src_enm", "rule_attd_quest")
        .eq("del_yn", false)
        .maybeSingle();
      if (existing) { alreadyGranted++; continue; }

      const { error: insErr } = await db.from("fee_due_exm_hist").insert({
        team_id: teamId,
        mem_id: m.mem_id,
        exm_cfg_id: null,
        aply_ym: ym,
        exm_amt: result.exmAmt,
        grant_src_enm: "rule_attd_quest",
        rsn_txt: rsnTxt,
        aprv_by_mem_id: member.id,
        aprv_at: dayjs().toISOString(),
        rflt_yn: false,
        vers: 0,
        del_yn: false,
      });
      if (insErr) { errors.push(`${m.mem_id} 면제 INSERT 실패: ${insErr.message}`); continue; }
      granted++;
    }

    const errSuffix = errors.length ? ` / 오류 ${errors.length}건: ${errors.slice(0, 3).join("; ")}` : "";
    const dupSuffix = alreadyGranted > 0 ? `, ${alreadyGranted}명 기존 부여(스킵)` : "";
    return `대상 월 ${ym}: ${targets.length}명 중 ${granted}명 감면 부여, ${skippedZero}명 미해당${dupSuffix}${errSuffix}`;
  });
}
