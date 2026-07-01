"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { dayjs } from "@/lib/dayjs";

import {
  currentMonthKST,
  todayKST,
  todayDayKST,
  nextMonthStr,
  prevMonthStr,
} from "@/lib/dayjs";
import {
  calcBaseMileage,
  calcFinalMileage,
  computeGoalChain,
  roundMileage,
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE,
  ENTRY_FEE_WITH_SINGLET,
  type MileageSport,
} from "@/lib/mileage";
import { withActive } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import { activityLogBatchSchema, activityLogSchema } from "@/lib/validations/mileage";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

export interface ActivityLogInput {
  act_dt: string; // 'YYYY-MM-DD'
  sprt_enm: MileageSport;
  distance_km: number;
  elevation_m: number;
  applied_mult_ids: string[]; // evt_mlg_mult_cfg.mult_id 배열
  review: string | null;
}

type ActionResult = { ok: boolean; message: string | null; grantedTitles?: string[] };

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────

function validateActivityDate(actDt: string, isAdmin: boolean): string | null {
  if (isAdmin) return null;

  const today = todayKST();
  if (actDt > today) return "미래 날짜에는 기록을 추가할 수 없습니다";

  const currentMonth = currentMonthKST().slice(0, 7);
  const actMonth = actDt.slice(0, 7);

  if (actMonth < currentMonth) {
    const dayOfMonth = todayDayKST();
    const prevMonthStr2 = prevMonthStr(currentMonthKST()).slice(0, 7);

    if (actMonth < prevMonthStr2) return "2개월 이전 기록은 추가할 수 없습니다";
    if (dayOfMonth > 3) return "전월 기록은 매월 3일까지만 추가할 수 있습니다";
  }

  return null;
}

async function buildAppliedMults(
  evtId: string,
  multIds: string[],
  actDt: string,
): Promise<{
  appliedMults: { mult_id: string; mult_nm: string; mult_val: number }[];
  multValues: number[];
  error: string | null;
}> {
  if (multIds.length === 0) return { appliedMults: [], multValues: [], error: null };

  const db = createAdminClient();
  const { data, error } = await db
    .from("evt_mlg_mult_cfg")
    .select("mult_id, mult_nm, mult_val, stt_dt, end_dt, active_yn")
    .eq("evt_id", evtId)
    .in("mult_id", multIds);

  if (error) return { appliedMults: [], multValues: [], error: "배율 조회에 실패했습니다" };

  const appliedMults: { mult_id: string; mult_nm: string; mult_val: number }[] = [];
  const multValues: number[] = [];

  for (const mult of data ?? []) {
    if (!mult.active_yn) continue;
    if (mult.stt_dt && actDt < mult.stt_dt) continue;
    if (mult.end_dt && actDt > mult.end_dt) continue;

    appliedMults.push({ mult_id: mult.mult_id, mult_nm: mult.mult_nm, mult_val: Number(mult.mult_val) });
    multValues.push(Number(mult.mult_val));
  }

  return { appliedMults, multValues, error: null };
}

// ─────────────────────────────────────────
// 1. 프로젝트 참여 신청
// ─────────────────────────────────────────

export async function joinProject(
  evtId: string,
  initGoal: number,
  hasSinglet: boolean,
): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const db = createAdminClient();

    const { data: evt, error: evtError } = await db
      .from("evt_team_mst")
      .select("end_dt, stt_dt")
      .eq("evt_id", evtId)
      .single();

    if (evtError || !evt) return { ok: false, message: "이벤트를 찾을 수 없습니다" };

    const curMonth = currentMonthKST();
    const evtStartMonth = evt.stt_dt.slice(0, 7) + "-01";
    const evtEndMonth = evt.end_dt.slice(0, 7) + "-01";
    const depositStart = curMonth < evtStartMonth ? evtStartMonth : curMonth;
    const remainMonths = countMonths(depositStart, evtEndMonth);

    const depositAmt = remainMonths * DEPOSIT_PER_MONTH;
    const entryFeeAmt = hasSinglet ? ENTRY_FEE_WITH_SINGLET : ENTRY_FEE;
    const singletFeeAmt = 0;

    const { data: prt, error: prtError } = await db
      .from("evt_team_prt_rel")
      .insert({
        evt_id: evtId, mem_id: member.id, aprv_yn: false, stt_mth: curMonth,
        init_goal: initGoal, deposit_amt: depositAmt, entry_fee_amt: entryFeeAmt,
        singlet_fee_amt: singletFeeAmt, has_singlet_yn: hasSinglet,
      })
      .select("prt_id")
      .single();

    if (prtError) {
      if (prtError.code === "23505") return { ok: false, message: "이미 참여 신청하셨습니다" };
      return { ok: false, message: "참여 신청에 실패했습니다" };
    }
    if (!prt) return { ok: false, message: "참여 신청 처리에 실패했습니다" };

    const goalRows: {
      prt_id: string;
      base_dt: string;
      goal_mlg: number;
      achv_yn: boolean;
      act_cnt: number;
      achv_mlg: number;
      lst_act_dt: string | null;
    }[] = [];
    let m = curMonth;
    while (m <= evtEndMonth) {
      goalRows.push({ prt_id: prt.prt_id, base_dt: m, goal_mlg: initGoal, achv_yn: false, act_cnt: 0, achv_mlg: 0, lst_act_dt: null });
      m = nextMonthStr(m);
    }

    const { error: goalError } = await db.from("evt_mlg_mth_snap").insert(goalRows);
    if (goalError) {
      await db.from("evt_team_prt_rel").delete().eq("prt_id", prt.prt_id);
      return { ok: false, message: "월별 목표 생성에 실패했습니다" };
    }

    revalidatePath("/projects");

    const { data: teamMemRow } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_id")
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (teamMemRow) {
      const ctx = {
        trigger: "mileage_run" as const,
        teamId: teamMemRow.team_id,
        teamMemId: teamMemRow.team_mem_id,
        projectId: evtId,
        actDt: currentMonthKST(),
        prevAchvYn: false,
      };
      after(() => evaluateAndGrantTitles(ctx).catch((e) => console.error("[title-engine] mileage_run(join) 평가 실패", e)));
    }

    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 2. 활동 기록 추가
// ─────────────────────────────────────────

export async function logActivity(
  evtId: string,
  input: ActivityLogInput,
): Promise<ActionResult> {
  const parsed = activityLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInput = parsed.data;

  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;
    const dateErr = validateActivityDate(validInput.act_dt, isAdmin);
    if (dateErr) return { ok: false, message: dateErr };

    const db = createAdminClient();
    const { data: participant, error: participantErr } = await db
      .from("evt_team_prt_rel")
      .select("prt_id")
      .eq("evt_id", evtId)
      .eq("mem_id", member.id)
      .eq("aprv_yn", true)
      .single();

    if (participantErr || !participant) return { ok: false, message: "참여 신청 정보를 찾을 수 없습니다" };

    const { appliedMults, multValues, error: multErr } = await buildAppliedMults(evtId, validInput.applied_mult_ids, validInput.act_dt);
    if (multErr) return { ok: false, message: multErr };

    const baseMlg = roundMileage(calcBaseMileage(validInput.sprt_enm, validInput.distance_km, validInput.elevation_m));
    const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

    const actMonth = validInput.act_dt.slice(0, 7) + "-01";
    const { data: prevSnap } = await db
      .from("evt_mlg_mth_snap")
      .select("achv_yn")
      .eq("prt_id", participant.prt_id)
      .eq("base_dt", actMonth)
      .maybeSingle();
    const prevAchvYn = prevSnap?.achv_yn ?? false;

    const { error } = await db.from("evt_mlg_act_hist").insert({
      prt_id: participant.prt_id, act_dt: validInput.act_dt, sprt_enm: validInput.sprt_enm,
      dst_km: validInput.distance_km, elv_m: validInput.elevation_m,
      base_mlg: baseMlg, aply_mults: appliedMults, final_mlg: finalMlg,
      review: validInput.review?.trim() || null,
    });

    if (error) return { ok: false, message: "활동 기록 추가에 실패했습니다" };

    await recalcGoalsFromMonth(evtId, participant.prt_id);

    const { data: teamMemRow, error: teamMemErr } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_id")
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    console.info("[title-engine] teamMemRow:", teamMemRow, "error:", teamMemErr);
    if (teamMemRow) {
      const ctx = {
        trigger: "mileage_run" as const,
        teamId: teamMemRow.team_id,
        teamMemId: teamMemRow.team_mem_id,
        projectId: evtId,
        actDt: validInput.act_dt,
        prevAchvYn,
      };
      console.info("[title-engine] ctx:", ctx);
      await evaluateAndGrantTitles(ctx).catch((e) => console.error("[title-engine] mileage_run(log) 평가 실패", e));
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 3. 활동 기록 다건 추가
// ─────────────────────────────────────────

export async function logActivitiesBatch(
  evtId: string,
  inputs: ActivityLogInput[],
): Promise<ActionResult> {
  const parsed = activityLogBatchSchema.safeParse(inputs);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInputs = parsed.data;

  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;

    const db = createAdminClient();
    const { data: participant, error: participantErr } = await db
      .from("evt_team_prt_rel")
      .select("prt_id")
      .eq("evt_id", evtId)
      .eq("mem_id", member.id)
      .eq("aprv_yn", true)
      .single();

    if (participantErr || !participant) return { ok: false, message: "참여 신청 정보를 찾을 수 없습니다" };

    const rows: {
      prt_id: string;
      act_dt: string;
      sprt_enm: MileageSport;
      dst_km: number;
      elv_m: number;
      base_mlg: number;
      aply_mults: { mult_id: string; mult_nm: string; mult_val: number }[];
      final_mlg: number;
      review: string | null;
    }[] = [];

    for (let i = 0; i < validInputs.length; i++) {
      const input = validInputs[i];
      const dateErr = validateActivityDate(input.act_dt, isAdmin);
      if (dateErr) return { ok: false, message: `${i + 1}번째 기록: ${dateErr}` };

      const { appliedMults, multValues, error: multErr } = await buildAppliedMults(evtId, input.applied_mult_ids, input.act_dt);
      if (multErr) return { ok: false, message: `${i + 1}번째 기록: ${multErr}` };

      const baseMlg = roundMileage(calcBaseMileage(input.sprt_enm, input.distance_km, input.elevation_m));
      const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

      rows.push({
        prt_id: participant.prt_id, act_dt: input.act_dt, sprt_enm: input.sprt_enm,
        dst_km: input.distance_km, elv_m: input.elevation_m,
        base_mlg: baseMlg, aply_mults: appliedMults, final_mlg: finalMlg,
        review: input.review?.trim() || null,
      });
    }

    const uniqueDates = [...new Set(validInputs.map((i) => i.act_dt))];
    const prevAchvYnMap = new Map<string, boolean>();
    for (const actDt of uniqueDates) {
      const actMonth = actDt.slice(0, 7) + "-01";
      const { data: snap } = await db
        .from("evt_mlg_mth_snap")
        .select("achv_yn")
        .eq("prt_id", participant.prt_id)
        .eq("base_dt", actMonth)
        .maybeSingle();
      prevAchvYnMap.set(actDt, snap?.achv_yn ?? false);
    }

    const { error } = await db.from("evt_mlg_act_hist").insert(rows);
    if (error) return { ok: false, message: "활동 기록 저장에 실패했습니다" };

    await recalcGoalsFromMonth(evtId, participant.prt_id);

    const { data: teamMemRow } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_id")
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    const allGranted: string[] = [];
    if (teamMemRow) {
      for (const actDt of uniqueDates) {
        const ctx = {
          trigger: "mileage_run" as const,
          teamId: teamMemRow.team_id,
          teamMemId: teamMemRow.team_mem_id,
          projectId: evtId,
          actDt,
          prevAchvYn: prevAchvYnMap.get(actDt) ?? false,
        };
        const granted = await evaluateAndGrantTitles(ctx).catch((e) => {
          console.error("[title-engine] mileage_run(batch) 평가 실패", e);
          return [] as string[];
        });
        allGranted.push(...granted);
      }
    }

    revalidatePath("/projects");
    return { ok: true, message: null, grantedTitles: allGranted };
  });
}

// ─────────────────────────────────────────
// 4. 활동 기록 수정
// ─────────────────────────────────────────

export async function updateActivity(
  actId: string,
  input: ActivityLogInput,
): Promise<ActionResult> {
  const parsed = activityLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInput = parsed.data;

  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;
    const db = createAdminClient();

    const { data: existing, error: fetchErr } = await db
      .from("evt_mlg_act_hist")
      .select("act_id, prt_id, evt_team_prt_rel!inner(mem_id, evt_id)")
      .eq("act_id", actId)
      .single();

    if (fetchErr || !existing) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const existingParticipant = existing.evt_team_prt_rel as { mem_id: string; evt_id: string };
    if (!isAdmin && existingParticipant.mem_id !== member.id) {
      return { ok: false, message: "본인 기록만 수정할 수 있습니다" };
    }

    const dateErr = validateActivityDate(validInput.act_dt, isAdmin);
    if (dateErr) return { ok: false, message: dateErr };

    const { appliedMults, multValues, error: multErr } = await buildAppliedMults(
      existingParticipant.evt_id, validInput.applied_mult_ids, validInput.act_dt,
    );
    if (multErr) return { ok: false, message: multErr };

    const baseMlg = roundMileage(calcBaseMileage(validInput.sprt_enm, validInput.distance_km, validInput.elevation_m));
    const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

    const { error } = await db
      .from("evt_mlg_act_hist")
      .update({
        act_dt: validInput.act_dt, sprt_enm: validInput.sprt_enm, dst_km: validInput.distance_km,
        elv_m: validInput.elevation_m, base_mlg: baseMlg, aply_mults: appliedMults,
        final_mlg: finalMlg, review: validInput.review?.trim() || null, updated_at: dayjs().toISOString(),
      })
      .eq("act_id", actId);

    if (error) return { ok: false, message: "활동 기록 수정에 실패했습니다" };

    await recalcGoalsFromMonth(existingParticipant.evt_id, existing.prt_id);

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 5. 활동 기록 삭제
// ─────────────────────────────────────────

export async function deleteActivity(actId: string): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;
    const db = createAdminClient();

    const { data: existing, error: fetchErr } = await db
      .from("evt_mlg_act_hist")
      .select("act_id, prt_id, act_dt, evt_team_prt_rel!inner(mem_id, evt_id)")
      .eq("act_id", actId)
      .single();

    if (fetchErr || !existing) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const existingParticipant = existing.evt_team_prt_rel as { mem_id: string; evt_id: string };
    if (!isAdmin && existingParticipant.mem_id !== member.id) {
      return { ok: false, message: "본인 기록만 삭제할 수 있습니다" };
    }

    const dateErr = validateActivityDate(existing.act_dt, isAdmin);
    if (dateErr) return { ok: false, message: dateErr };

    const { error } = await db.from("evt_mlg_act_hist").delete().eq("act_id", actId);
    if (error) return { ok: false, message: "활동 기록 삭제에 실패했습니다" };

    await recalcGoalsFromMonth(existingParticipant.evt_id, existing.prt_id);

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 6. 월별 목표 수정
// ─────────────────────────────────────────

export async function updateMonthlyGoal(goalId: string, newGoal: number): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;

    if (!isAdmin && todayDayKST() > 14) {
      return { ok: false, message: "목표는 매월 14일까지만 수정할 수 있습니다" };
    }

    const db = createAdminClient();

    const { data: existing, error: fetchErr } = await db
      .from("evt_mlg_mth_snap")
      .select("goal_id, prt_id, goal_mlg, evt_team_prt_rel!inner(mem_id, evt_id)")
      .eq("goal_id", goalId)
      .single();

    if (fetchErr || !existing) return { ok: false, message: "목표를 찾을 수 없습니다" };
    const participant = existing.evt_team_prt_rel as { mem_id: string; evt_id: string };
    const evtId = participant.evt_id;
    if (!isAdmin && participant.mem_id !== member.id) return { ok: false, message: "본인 목표만 수정할 수 있습니다" };
    if (!isAdmin && newGoal < Number(existing.goal_mlg)) return { ok: false, message: "목표는 현재 값 이상으로만 설정할 수 있습니다" };

    const { error } = await db
      .from("evt_mlg_mth_snap")
      .update({ goal_mlg: newGoal, updated_at: dayjs().toISOString() })
      .eq("goal_id", goalId);

    if (error) return { ok: false, message: "목표 수정에 실패했습니다" };

    await recalcGoalsFromMonth(evtId, existing.prt_id, goalId);

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 7. 목표 연쇄 재계산 (내부)
// ─────────────────────────────────────────

async function recalcGoalsFromMonth(
  evtId: string,
  prtId: string,
  anchorGoalId?: string,
): Promise<void> {
  const db = createAdminClient();

  const { data: evt } = await db.from("evt_team_mst").select("stt_dt, end_dt").eq("evt_id", evtId).single();
  if (!evt) return;

  const evtStartMonth = evt.stt_dt.slice(0, 7) + "-01";

  const { data: goals } = await db
    .from("evt_mlg_mth_snap")
    .select("goal_id, base_dt, goal_mlg, achv_yn")
    .eq("prt_id", prtId)
    .order("base_dt", { ascending: true });

  if (!goals || goals.length === 0) return;

  const { data: allLogs } = await db
    .from("evt_mlg_act_hist")
    .select("act_dt, final_mlg")
    .eq("prt_id", prtId);

  const mlgByMonth = new Map<string, number>();
  const cntByMonth = new Map<string, number>();
  const lastDtByMonth = new Map<string, string>();
  for (const log of allLogs ?? []) {
    const m = (log.act_dt as string).slice(0, 7) + "-01";
    mlgByMonth.set(m, (mlgByMonth.get(m) ?? 0) + Number(log.final_mlg));
    cntByMonth.set(m, (cntByMonth.get(m) ?? 0) + 1);
    const prevLast = lastDtByMonth.get(m);
    const actDt = log.act_dt as string;
    if (!prevLast || actDt > prevLast) lastDtByMonth.set(m, actDt);
  }
  const roundedAchvByMonth = new Map<string, number>();
  for (const [month, totalMlg] of mlgByMonth.entries()) {
    roundedAchvByMonth.set(month, roundMileage(totalMlg));
  }

  for (const g of goals) {
    const month = g.base_dt as string;
    const achvMlg = roundedAchvByMonth.get(month) ?? 0;
    const actCnt = cntByMonth.get(month) ?? 0;
    const lstActDt = lastDtByMonth.get(month) ?? null;
    const achvYn = Math.round(achvMlg * 10) / 10 >= Number(g.goal_mlg);

    await db
      .from("evt_mlg_mth_snap")
      .update({ achv_mlg: achvMlg, act_cnt: actCnt, lst_act_dt: lstActDt, achv_yn: achvYn, updated_at: dayjs().toISOString() })
      .eq("goal_id", g.goal_id);
    g.achv_yn = achvYn;
  }

  let anchorIdx = 0;
  if (anchorGoalId) {
    const found = goals.findIndex((g) => g.goal_id === anchorGoalId);
    if (found > 0) anchorIdx = found;
  }

  const chain = computeGoalChain(
    goals.map((g) => ({
      base_dt: g.base_dt as string,
      goal_mlg: Number(g.goal_mlg),
      achv_mlg: roundedAchvByMonth.get(g.base_dt as string) ?? 0,
    })),
    evtStartMonth,
    anchorIdx,
  );

  for (let i = anchorIdx + 1; i < goals.length; i++) {
    const cur = goals[i];
    const next = chain[i];
    if (Number(cur.goal_mlg) === next.goal_mlg) continue;

    await db
      .from("evt_mlg_mth_snap")
      .update({ goal_mlg: next.goal_mlg, achv_yn: next.achv_yn, updated_at: dayjs().toISOString() })
      .eq("goal_id", cur.goal_id);
    cur.goal_mlg = next.goal_mlg;
    cur.achv_yn = next.achv_yn;
  }
}
