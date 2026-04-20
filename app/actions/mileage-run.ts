"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";
import { verifyAdmin } from "@/lib/queries/member";
import dayjs from "dayjs";
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
  calcNextMonthGoal,
  roundMileage,
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE,
  ENTRY_FEE_WITH_SINGLET,
  type MileageSport,
} from "@/lib/mileage";
import { activityLogSchema } from "@/lib/validations/mileage";

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

type ActionResult = { ok: boolean; message: string | null };

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────

/**
 * 활동 날짜 유효성 검사.
 * - 미래 날짜 금지
 * - 전월 기록은 이번 달 3일까지만 허용
 * admin 이면 모든 날짜 허용.
 */
function validateActivityDate(actDt: string, isAdmin: boolean): string | null {
  if (isAdmin) return null;

  const today = todayKST();
  if (actDt > today) return "미래 날짜에는 기록을 추가할 수 없습니다";

  const currentMonth = currentMonthKST().slice(0, 7); // 'YYYY-MM'
  const actMonth = actDt.slice(0, 7);

  if (actMonth < currentMonth) {
    // 전월 이전 기록: 이번 달 3일까지만
    const dayOfMonth = todayDayKST();
    const prevMonthStr2 = prevMonthStr(currentMonthKST()).slice(0, 7);

    if (actMonth < prevMonthStr2) {
      return "2개월 이전 기록은 추가할 수 없습니다";
    }
    if (dayOfMonth > 3) {
      return "전월 기록은 매월 3일까지만 추가할 수 있습니다";
    }
  }

  return null;
}

/**
 * 배율 스냅샷 생성.
 * - applied_mult_ids로 evt_mlg_mult_cfg 조회
 * - 날짜 범위가 있는 배율은 act_dt가 범위 내인지 확인
 * - applied_mults jsonb 배열 및 multiplier 값 배열 반환
 */
async function buildAppliedMults(
  evtId: string,
  multIds: string[],
  actDt: string,
): Promise<{
  appliedMults: { mult_id: string; mult_nm: string; mult_val: number }[];
  multValues: number[];
  error: string | null;
}> {
  if (multIds.length === 0) {
    return { appliedMults: [], multValues: [], error: null };
  }

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

    // 날짜 범위 필터링
    if (mult.stt_dt && actDt < mult.stt_dt) continue;
    if (mult.end_dt && actDt > mult.end_dt) continue;

    appliedMults.push({
      mult_id: mult.mult_id,
      mult_nm: mult.mult_nm,
      mult_val: Number(mult.mult_val),
    });
    multValues.push(Number(mult.mult_val));
  }

  return { appliedMults, multValues, error: null };
}

// ─────────────────────────────────────────
// 1. 프로젝트 참여 신청
// ─────────────────────────────────────────

/**
 * 마일리지런 프로젝트 참여 신청.
 * - aprv_yn: false 로 INSERT (관리자 승인 대기)
 * - 잔여 개월 × DEPOSIT_PER_MONTH + ENTRY_FEE (+ singlet fee) 로 deposit_amt 계산
 * - 당월 initGoal 목표 자동 생성
 */
export async function joinProject(
  evtId: string,
  initGoal: number,
  hasSinglet: boolean,
): Promise<ActionResult> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const db = createAdminClient();

  // 이벤트 end_dt 조회
  const { data: evt, error: evtError } = await db
    .from("evt_team_mst")
    .select("end_dt, stt_dt")
    .eq("evt_id", evtId)
    .single();

  if (evtError || !evt) return { ok: false, message: "이벤트를 찾을 수 없습니다" };

  const curMonth = currentMonthKST();
  const evtStartMonth = evt.stt_dt.slice(0, 7) + "-01";
  const evtEndMonth = evt.end_dt.slice(0, 7) + "-01";
  // 보증금은 이벤트 시작월부터 계산 (연습기간 제외)
  const depositStart = curMonth < evtStartMonth ? evtStartMonth : curMonth;
  const remainMonths = countMonths(depositStart, evtEndMonth);

  const depositAmt = remainMonths * DEPOSIT_PER_MONTH;
  const entryFeeAmt = hasSinglet ? ENTRY_FEE_WITH_SINGLET : ENTRY_FEE;
  const singletFeeAmt = 0;

  // evt_team_prt_rel INSERT
  const { error: prtError } = await db.from("evt_team_prt_rel").insert({
    evt_id: evtId,
    mem_id: member.id,
    aprv_yn: false,
    stt_mth: curMonth,
    init_goal: initGoal,
    deposit_amt: depositAmt,
    entry_fee_amt: entryFeeAmt,
    singlet_fee_amt: singletFeeAmt,
    has_singlet_yn: hasSinglet,
  });

  if (prtError) {
    if (prtError.code === "23505") {
      return { ok: false, message: "이미 참여 신청하셨습니다" };
    }
    return { ok: false, message: "참여 신청에 실패했습니다" };
  }

  // 시작월~종료월까지 전체 목표 미리 생성 (init_goal)
  const goalRows: { evt_id: string; mem_id: string; goal_mth: string; goal_val: number; achieved_yn: boolean }[] = [];
  let m = curMonth;
  while (m <= evtEndMonth) {
    goalRows.push({
      evt_id: evtId,
      mem_id: member.id,
      goal_mth: m,
      goal_val: initGoal,
      achieved_yn: false,
    });
    m = nextMonthStr(m);
  }

  const { error: goalError } = await db.from("evt_mlg_goal_cfg").insert(goalRows);

  if (goalError) {
    await db
      .from("evt_team_prt_rel")
      .delete()
      .eq("evt_id", evtId)
      .eq("mem_id", member.id);
    return { ok: false, message: "월별 목표 생성에 실패했습니다" };
  }

  revalidatePath("/projects");
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 2. 활동 기록 추가
// ─────────────────────────────────────────

/**
 * 마일리지런 활동 기록 추가.
 * - 날짜 검증 (미래 금지, 전월은 3일까지 / admin 우회)
 * - 배율 스냅샷으로 base_mlg / final_mlg 계산
 */
export async function logActivity(
  evtId: string,
  input: ActivityLogInput,
): Promise<ActionResult> {
  const parsed = activityLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInput = parsed.data;

  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const admin = await verifyAdmin();
  const isAdmin = admin !== null;

  const dateErr = validateActivityDate(validInput.act_dt, isAdmin);
  if (dateErr) return { ok: false, message: dateErr };

  const { appliedMults, multValues, error: multErr } = await buildAppliedMults(
    evtId,
    validInput.applied_mult_ids,
    validInput.act_dt,
  );
  if (multErr) return { ok: false, message: multErr };

  const baseMlg = roundMileage(
    calcBaseMileage(validInput.sprt_enm, validInput.distance_km, validInput.elevation_m),
  );
  const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

  const db = createAdminClient();
  const { error } = await db.from("evt_mlg_act_hist").insert({
    evt_id: evtId,
    mem_id: member.id,
    act_dt: validInput.act_dt,
    sprt_enm: validInput.sprt_enm,
    distance_km: validInput.distance_km,
    elevation_m: validInput.elevation_m,
    base_mlg: baseMlg,
    applied_mults: appliedMults,
    final_mlg: finalMlg,
    review: validInput.review?.trim() || null,
  });

  if (error) return { ok: false, message: "활동 기록 추가에 실패했습니다" };

  // 기록이 속한 월 이후 목표 연쇄 재계산
  await recalcGoalsFromMonth(evtId, member.id);

  revalidatePath("/projects");
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 3. 활동 기록 수정
// ─────────────────────────────────────────

/**
 * 마일리지런 활동 기록 수정.
 * - 본인 기록만 수정 가능
 * - 날짜 검증 동일 적용
 */
export async function updateActivity(
  actId: string,
  input: ActivityLogInput,
): Promise<ActionResult> {
  const parsed = activityLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInput = parsed.data;

  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const admin = await verifyAdmin();
  const isAdmin = admin !== null;

  const db = createAdminClient();

  // 기존 기록 조회 → 본인 확인
  const { data: existing, error: fetchErr } = await db
    .from("evt_mlg_act_hist")
    .select("act_id, mem_id, evt_id")
    .eq("act_id", actId)
    .single();

  if (fetchErr || !existing) return { ok: false, message: "기록을 찾을 수 없습니다" };
  if (!isAdmin && existing.mem_id !== member.id) {
    return { ok: false, message: "본인 기록만 수정할 수 있습니다" };
  }

  const dateErr = validateActivityDate(validInput.act_dt, isAdmin);
  if (dateErr) return { ok: false, message: dateErr };

  const { appliedMults, multValues, error: multErr } = await buildAppliedMults(
    existing.evt_id,
    validInput.applied_mult_ids,
    validInput.act_dt,
  );
  if (multErr) return { ok: false, message: multErr };

  const baseMlg = roundMileage(
    calcBaseMileage(validInput.sprt_enm, validInput.distance_km, validInput.elevation_m),
  );
  const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

  const { error } = await db
    .from("evt_mlg_act_hist")
    .update({
      act_dt: validInput.act_dt,
      sprt_enm: validInput.sprt_enm,
      distance_km: validInput.distance_km,
      elevation_m: validInput.elevation_m,
      base_mlg: baseMlg,
      applied_mults: appliedMults,
      final_mlg: finalMlg,
      review: validInput.review?.trim() || null,
      updated_at: dayjs().toISOString(),
    })
    .eq("act_id", actId);

  if (error) return { ok: false, message: "활동 기록 수정에 실패했습니다" };

  await recalcGoalsFromMonth(existing.evt_id, existing.mem_id);

  revalidatePath("/projects");
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 4. 활동 기록 삭제
// ─────────────────────────────────────────

/**
 * 마일리지런 활동 기록 삭제.
 * - 본인 기록만 삭제 가능 (admin 우회)
 * - 날짜 검증 동일 적용
 */
export async function deleteActivity(
  actId: string,
): Promise<ActionResult> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const admin = await verifyAdmin();
  const isAdmin = admin !== null;

  const db = createAdminClient();

  // 기존 기록 조회 → 본인 확인 + DB의 실제 날짜로 검증
  const { data: existing, error: fetchErr } = await db
    .from("evt_mlg_act_hist")
    .select("act_id, mem_id, evt_id, act_dt")
    .eq("act_id", actId)
    .single();

  if (fetchErr || !existing) return { ok: false, message: "기록을 찾을 수 없습니다" };
  if (!isAdmin && existing.mem_id !== member.id) {
    return { ok: false, message: "본인 기록만 삭제할 수 있습니다" };
  }

  const dateErr = validateActivityDate(existing.act_dt, isAdmin);
  if (dateErr) return { ok: false, message: dateErr };

  const { error } = await db
    .from("evt_mlg_act_hist")
    .delete()
    .eq("act_id", actId);

  if (error) return { ok: false, message: "활동 기록 삭제에 실패했습니다" };

  await recalcGoalsFromMonth(existing.evt_id, existing.mem_id);

  revalidatePath("/projects");
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 5. 월별 목표 수정
// ─────────────────────────────────────────

/**
 * 월별 목표 수정.
 * - 본인 목표만 수정 가능
 * - 매월 14일까지만 수정 가능 (admin 우회)
 * - 상향만 가능 (기존값 이상)
 */
export async function updateMonthlyGoal(
  goalId: string,
  newGoal: number,
): Promise<ActionResult> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const admin = await verifyAdmin();
  const isAdmin = admin !== null;

  if (!isAdmin && todayDayKST() > 14) {
    return { ok: false, message: "목표는 매월 14일까지만 수정할 수 있습니다" };
  }

  const db = createAdminClient();

  // 기존 목표 조회 → 본인 확인
  const { data: existing, error: fetchErr } = await db
    .from("evt_mlg_goal_cfg")
    .select("goal_id, evt_id, mem_id, goal_val")
    .eq("goal_id", goalId)
    .single();

  if (fetchErr || !existing) return { ok: false, message: "목표를 찾을 수 없습니다" };
  const evtId = existing.evt_id;
  if (!isAdmin && existing.mem_id !== member.id) {
    return { ok: false, message: "본인 목표만 수정할 수 있습니다" };
  }

  if (newGoal < Number(existing.goal_val)) {
    return { ok: false, message: "목표는 현재 값 이상으로만 설정할 수 있습니다" };
  }

  const { error } = await db
    .from("evt_mlg_goal_cfg")
    .update({
      goal_val: newGoal,
      updated_at: dayjs().toISOString(),
    })
    .eq("goal_id", goalId);

  if (error) return { ok: false, message: "목표 수정에 실패했습니다" };

  await recalcGoalsFromMonth(evtId, existing.mem_id);

  revalidatePath("/projects");
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 6. 목표 연쇄 재계산
// ─────────────────────────────────────────

/**
 * 특정 참여자의 전체 목표를 연쇄 재계산.
 * - 이벤트 시작월 이전(연습기간)은 달성 여부가 다음 월 목표에 영향 없음
 * - 실전 기간: 달성 시 다음 월 목표 상향 (calcNextMonthGoal)
 * - 기록 추가/수정/삭제/목표 수정 후 호출
 */
async function recalcGoalsFromMonth(
  evtId: string,
  memId: string,
): Promise<void> {
  const db = createAdminClient();

  // 이벤트 정보 조회
  const { data: evt } = await db
    .from("evt_team_mst")
    .select("stt_dt, end_dt")
    .eq("evt_id", evtId)
    .single();
  if (!evt) return;

  const evtStartMonth = evt.stt_dt.slice(0, 7) + "-01";
  const evtEndMonth = evt.end_dt.slice(0, 7) + "-01";

  // 해당 참여자의 전체 목표 조회 (월순)
  const { data: goals } = await db
    .from("evt_mlg_goal_cfg")
    .select("goal_id, goal_mth, goal_val")
    .eq("evt_id", evtId)
    .eq("mem_id", memId)
    .order("goal_mth", { ascending: true });

  if (!goals || goals.length === 0) return;

  // 해당 참여자의 전체 기록 조회
  const { data: allLogs } = await db
    .from("evt_mlg_act_hist")
    .select("act_dt, final_mlg")
    .eq("evt_id", evtId)
    .eq("mem_id", memId);

  // 월별 마일리지 합산 맵
  const mlgByMonth = new Map<string, number>();
  for (const log of allLogs ?? []) {
    const m = (log.act_dt as string).slice(0, 7) + "-01";
    mlgByMonth.set(m, (mlgByMonth.get(m) ?? 0) + Number(log.final_mlg));
  }

  // 첫 번째 목표는 기준점 (init_goal 또는 사용자가 수정한 값) — 변경 안 함
  // 두 번째부터 이전 월 달성 여부에 따라 재계산
  for (let i = 1; i < goals.length; i++) {
    const prev = goals[i - 1];
    const cur = goals[i];
    const prevMonth = prev.goal_mth as string;
    const prevGoalVal = Number(prev.goal_val);

    // 연습기간이면 목표 상향 없이 이전 값 유지
    const isPractice = prevMonth < evtStartMonth;
    let newGoal: number;

    if (isPractice) {
      newGoal = prevGoalVal;
    } else {
      const achieved = (mlgByMonth.get(prevMonth) ?? 0) >= prevGoalVal;
      newGoal = calcNextMonthGoal(prevGoalVal, achieved);
    }

    if (Number(cur.goal_val) !== newGoal) {
      await db
        .from("evt_mlg_goal_cfg")
        .update({ goal_val: newGoal, updated_at: dayjs().toISOString() })
        .eq("goal_id", cur.goal_id);
      // 업데이트된 값으로 다음 반복에 반영
      cur.goal_val = newGoal;
    }
  }
}
