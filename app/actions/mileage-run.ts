"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";
import { verifyAdmin } from "@/lib/queries/member";
import {
  currentMonthKST,
  todayKST,
  todayDayKST,
  nextMonthStr,
} from "@/lib/dayjs";
import {
  calcBaseMileage,
  calcFinalMileage,
  calcNextMonthGoal,
  roundMileage,
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE,
  SINGLET_FEE,
  type MileageSport,
} from "@/lib/mileage";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

export interface ActivityLogInput {
  act_dt: string; // 'YYYY-MM-DD'
  sport_cd: MileageSport;
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
    const prevMonth = new Date(today.slice(0, 7) + "-01");
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStr2 = prevMonth.toISOString().slice(0, 7);

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
 * - approve_yn: false 로 INSERT (관리자 승인 대기)
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
  const evtEndMonth = evt.end_dt.slice(0, 7) + "-01";
  const remainMonths = countMonths(curMonth, evtEndMonth);

  const depositAmt = remainMonths * DEPOSIT_PER_MONTH;
  const entryFeeAmt = ENTRY_FEE;
  const singletFeeAmt = hasSinglet ? SINGLET_FEE : 0;

  // evt_team_prt_rel INSERT
  const { error: prtError } = await db.from("evt_team_prt_rel").insert({
    evt_id: evtId,
    mem_id: member.id,
    approve_yn: false,
    stt_month: curMonth,
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

  // 첫 월별 목표 INSERT
  const { error: goalError } = await db.from("evt_mlg_goal_cfg").insert({
    evt_id: evtId,
    mem_id: member.id,
    goal_month: curMonth,
    goal_val: initGoal,
    achieved_yn: false,
  });

  if (goalError) {
    // 목표 생성 실패 시 참여 신청 롤백
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
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const admin = await verifyAdmin();
  const isAdmin = admin !== null;

  const dateErr = validateActivityDate(input.act_dt, isAdmin);
  if (dateErr) return { ok: false, message: dateErr };

  const { appliedMults, multValues, error: multErr } = await buildAppliedMults(
    evtId,
    input.applied_mult_ids,
    input.act_dt,
  );
  if (multErr) return { ok: false, message: multErr };

  const baseMlg = roundMileage(
    calcBaseMileage(input.sport_cd, input.distance_km, input.elevation_m),
  );
  const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

  const db = createAdminClient();
  const { error } = await db.from("evt_mlg_act_hist").insert({
    evt_id: evtId,
    mem_id: member.id,
    act_dt: input.act_dt,
    sport_cd: input.sport_cd,
    distance_km: input.distance_km,
    elevation_m: input.elevation_m,
    base_mlg: baseMlg,
    applied_mults: appliedMults,
    final_mlg: finalMlg,
    review: input.review?.trim() || null,
  });

  if (error) return { ok: false, message: "활동 기록 추가에 실패했습니다" };

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

  const dateErr = validateActivityDate(input.act_dt, isAdmin);
  if (dateErr) return { ok: false, message: dateErr };

  const { appliedMults, multValues, error: multErr } = await buildAppliedMults(
    existing.evt_id,
    input.applied_mult_ids,
    input.act_dt,
  );
  if (multErr) return { ok: false, message: multErr };

  const baseMlg = roundMileage(
    calcBaseMileage(input.sport_cd, input.distance_km, input.elevation_m),
  );
  const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

  const { error } = await db
    .from("evt_mlg_act_hist")
    .update({
      act_dt: input.act_dt,
      sport_cd: input.sport_cd,
      distance_km: input.distance_km,
      elevation_m: input.elevation_m,
      base_mlg: baseMlg,
      applied_mults: appliedMults,
      final_mlg: finalMlg,
      review: input.review?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("act_id", actId);

  if (error) return { ok: false, message: "활동 기록 수정에 실패했습니다" };

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
  actDt: string,
): Promise<ActionResult> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const admin = await verifyAdmin();
  const isAdmin = admin !== null;

  const db = createAdminClient();

  // 기존 기록 조회 → 본인 확인
  const { data: existing, error: fetchErr } = await db
    .from("evt_mlg_act_hist")
    .select("act_id, mem_id")
    .eq("act_id", actId)
    .single();

  if (fetchErr || !existing) return { ok: false, message: "기록을 찾을 수 없습니다" };
  if (!isAdmin && existing.mem_id !== member.id) {
    return { ok: false, message: "본인 기록만 삭제할 수 있습니다" };
  }

  const dateErr = validateActivityDate(actDt, isAdmin);
  if (dateErr) return { ok: false, message: dateErr };

  const { error } = await db
    .from("evt_mlg_act_hist")
    .delete()
    .eq("act_id", actId);

  if (error) return { ok: false, message: "활동 기록 삭제에 실패했습니다" };

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
    .select("goal_id, mem_id, goal_val")
    .eq("goal_id", goalId)
    .single();

  if (fetchErr || !existing) return { ok: false, message: "목표를 찾을 수 없습니다" };
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
      updated_at: new Date().toISOString(),
    })
    .eq("goal_id", goalId);

  if (error) return { ok: false, message: "목표 수정에 실패했습니다" };

  revalidatePath("/projects");
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 6. 당월 목표 자동 생성 (단일 참여자)
// ─────────────────────────────────────────

/**
 * 특정 참여자의 당월 목표가 없으면 자동 생성.
 * - 이미 있으면 스킵
 * - 이벤트 종료월 이후면 스킵
 * - 전월 기록 합산 >= goal_val 이면 달성으로 간주 → calcNextMonthGoal 상향
 * - 전월 목표 없으면 init_goal 사용
 * - createAdminClient() 사용 (시스템 호출)
 */
export async function ensureCurrentMonthGoal(
  evtId: string,
  memId: string,
  evtEndDt: string,
): Promise<ActionResult> {
  const curMonth = currentMonthKST(); // 'YYYY-MM-01'

  // 이벤트 종료월 이후면 스킵
  const evtEndMonth = evtEndDt.slice(0, 7) + "-01";
  if (curMonth > evtEndMonth) return { ok: true, message: null };

  const db = createAdminClient();

  // 당월 목표 이미 존재하면 스킵
  const { data: existing } = await db
    .from("evt_mlg_goal_cfg")
    .select("goal_id")
    .eq("evt_id", evtId)
    .eq("mem_id", memId)
    .eq("goal_month", curMonth)
    .maybeSingle();

  if (existing) return { ok: true, message: null };

  // 전월 목표 조회
  const prevMonth = (() => {
    const d = new Date(curMonth);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7) + "-01";
  })();

  const { data: prevGoal } = await db
    .from("evt_mlg_goal_cfg")
    .select("goal_val")
    .eq("evt_id", evtId)
    .eq("mem_id", memId)
    .eq("goal_month", prevMonth)
    .maybeSingle();

  let baseGoal: number;

  if (prevGoal) {
    baseGoal = Number(prevGoal.goal_val);

    // 전월 활동 기록 합산 (final_mlg 기준)
    const { data: acts } = await db
      .from("evt_mlg_act_hist")
      .select("final_mlg")
      .eq("evt_id", evtId)
      .eq("mem_id", memId)
      .gte("act_dt", prevMonth)
      .lt("act_dt", curMonth);

    const totalMlg = (acts ?? []).reduce(
      (sum, a) => sum + Number(a.final_mlg),
      0,
    );
    const achieved = totalMlg >= baseGoal;
    baseGoal = calcNextMonthGoal(baseGoal, achieved);
  } else {
    // 전월 목표 없으면 init_goal 사용
    const { data: prt } = await db
      .from("evt_team_prt_rel")
      .select("init_goal")
      .eq("evt_id", evtId)
      .eq("mem_id", memId)
      .maybeSingle();

    baseGoal = prt ? Number(prt.init_goal) : 30;
  }

  const { error } = await db.from("evt_mlg_goal_cfg").insert({
    evt_id: evtId,
    mem_id: memId,
    goal_month: curMonth,
    goal_val: baseGoal,
    achieved_yn: false,
  });

  if (error) {
    // 동시 실행으로 인한 중복 INSERT(23505)는 무시
    if (error.code === "23505") return { ok: true, message: null };
    return { ok: false, message: "월별 목표 생성에 실패했습니다" };
  }

  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 7. 당월 목표 자동 생성 (전체 참여자)
// ─────────────────────────────────────────

/**
 * 이벤트의 승인된 참여자 전원에 대해 당월 목표 자동 생성.
 * - approve_yn = true 이고 stt_month <= 당월인 참여자 대상
 * - Promise.all 병렬 처리
 * - createAdminClient() 사용 (시스템 호출)
 */
export async function ensureAllCurrentMonthGoals(
  evtId: string,
  evtEndDt: string,
): Promise<ActionResult> {
  const curMonth = currentMonthKST();
  const db = createAdminClient();

  const { data: participants, error } = await db
    .from("evt_team_prt_rel")
    .select("mem_id")
    .eq("evt_id", evtId)
    .eq("approve_yn", true)
    .lte("stt_month", curMonth);

  if (error) return { ok: false, message: "참여자 조회에 실패했습니다" };
  if (!participants || participants.length === 0) return { ok: true, message: null };

  const results = await Promise.all(
    participants.map((p) => ensureCurrentMonthGoal(evtId, p.mem_id, evtEndDt)),
  );

  const failed = results.find((r) => !r.ok);
  if (failed) return { ok: false, message: failed.message };

  return { ok: true, message: null };
}
