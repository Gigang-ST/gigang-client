// app/actions/mileage-run.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  type Sport,
  calcBaseMileage,
  calcFinalMileage,
  calcNextMonthGoal,
  nextMonthStr,
  currentMonthKST,
  todayKST,
  todayDayKST,
} from "@/lib/mileage";

// ── 참여 신청 ──────────────────────────────────────────────
export async function joinProject(
  projectId: string,
  initialGoal: number,
  singletFeePaid: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: member } = await supabase
    .from("member")
    .select("id")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!member) return { error: "회원 정보를 찾을 수 없습니다." };

  const startMonth = currentMonthKST();

  const { data: participation, error: insertError } = await supabase
    .from("project_participation")
    .insert({
      project_id: projectId,
      member_id: member.id,
      start_month: startMonth,
      initial_goal: initialGoal,
      singlet_fee_paid: singletFeePaid,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") return { error: "이미 참여 신청하셨습니다." };
    return { error: "참여 신청 중 오류가 발생했습니다." };
  }

  // 첫 달 목표 생성
  await supabase.from("mileage_goal").insert({
    participation_id: participation.id,
    month: startMonth,
    goal_km: initialGoal,
  });

  revalidatePath("/projects");
  return {};
}

// ── 기록 입력 ──────────────────────────────────────────────
export async function logActivity(input: {
  participationId: string;
  activityDate: string;
  sport: Sport;
  distanceKm: number;
  elevationM: number;
  eventMultiplierIds: string[];
  review?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // 날짜 제한 검사
  const today = todayKST();
  if (input.activityDate > today) return { error: "미래 날짜는 입력할 수 없습니다." };

  const todayDay = todayDayKST();
  const inputMonth = input.activityDate.slice(0, 7);
  const todayMonth = today.slice(0, 7);

  if (inputMonth < todayMonth) {
    const isAdmin = await checkIsAdmin(supabase, user.id);
    if (!isAdmin && todayDay > 3) {
      return { error: "전월 기록은 매월 3일까지만 입력 가능합니다." };
    }
  }

  // 배율 이벤트 스냅샷 조회
  let multipliers: { id: string; multiplier: number }[] = [];
  if (input.eventMultiplierIds.length > 0) {
    const { data } = await supabase
      .from("event_multiplier")
      .select("id, multiplier")
      .in("id", input.eventMultiplierIds);
    multipliers = data ?? [];
  }

  const baseMileage = calcBaseMileage(input.sport, input.distanceKm, input.elevationM);
  const finalMileage = calcFinalMileage(
    baseMileage,
    multipliers.map((m) => m.multiplier),
  );

  const { data: log, error: logError } = await supabase
    .from("activity_log")
    .insert({
      participation_id: input.participationId,
      activity_date: input.activityDate,
      sport: input.sport,
      distance_km: input.distanceKm,
      elevation_m: input.elevationM,
      base_mileage: Math.round(baseMileage * 100) / 100,
      final_mileage: Math.round(finalMileage * 100) / 100,
      review: input.review ?? null,
    })
    .select("id")
    .single();

  if (logError || !log) return { error: "기록 저장 중 오류가 발생했습니다." };

  if (multipliers.length > 0) {
    const { error: eventError } = await supabase.from("activity_log_event").insert(
      multipliers.map((m) => ({
        activity_log_id: log.id,
        event_multiplier_id: m.id,
        multiplier_snapshot: m.multiplier,
      })),
    );
    if (eventError) return { error: "이벤트 배율 저장 중 오류가 발생했습니다." };
  }

  revalidatePath("/projects");
  return {};
}

// ── 기록 수정 ──────────────────────────────────────────────
export async function updateActivity(
  logId: string,
  input: {
    activityDate: string;
    sport: Sport;
    distanceKm: number;
    elevationM: number;
    eventMultiplierIds: string[];
    review?: string;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const today = todayKST();
  if (input.activityDate > today) return { error: "미래 날짜는 입력할 수 없습니다." };

  const todayDay = todayDayKST();
  const inputMonth = input.activityDate.slice(0, 7);
  const todayMonth = today.slice(0, 7);

  if (inputMonth < todayMonth) {
    const isAdmin = await checkIsAdmin(supabase, user.id);
    if (!isAdmin && todayDay > 3) {
      return { error: "전월 기록은 매월 3일까지만 수정 가능합니다." };
    }
  }

  const { data: existingLog } = await supabase
    .from("activity_log")
    .select("id, participation_id")
    .eq("id", logId)
    .maybeSingle();
  if (!existingLog) return { error: "기록을 찾을 수 없거나 권한이 없습니다." };

  let multipliers: { id: string; multiplier: number }[] = [];
  if (input.eventMultiplierIds.length > 0) {
    const { data } = await supabase
      .from("event_multiplier")
      .select("id, multiplier")
      .in("id", input.eventMultiplierIds);
    multipliers = data ?? [];
  }

  const baseMileage = calcBaseMileage(input.sport, input.distanceKm, input.elevationM);
  const finalMileage = calcFinalMileage(baseMileage, multipliers.map((m) => m.multiplier));

  const { error: updateError } = await supabase
    .from("activity_log")
    .update({
      activity_date: input.activityDate,
      sport: input.sport,
      distance_km: input.distanceKm,
      elevation_m: input.elevationM,
      base_mileage: Math.round(baseMileage * 100) / 100,
      final_mileage: Math.round(finalMileage * 100) / 100,
      review: input.review ?? null,
    })
    .eq("id", logId);

  if (updateError) return { error: "기록 수정 중 오류가 발생했습니다." };

  await supabase.from("activity_log_event").delete().eq("activity_log_id", logId);
  if (multipliers.length > 0) {
    const { error: eventError } = await supabase.from("activity_log_event").insert(
      multipliers.map((m) => ({
        activity_log_id: logId,
        event_multiplier_id: m.id,
        multiplier_snapshot: m.multiplier,
      })),
    );
    if (eventError) return { error: "이벤트 배율 저장 중 오류가 발생했습니다." };
  }

  revalidatePath("/projects");
  return {};
}

// ── 기록 삭제 ──────────────────────────────────────────────
export async function deleteActivity(
  logId: string,
  activityDate: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const today = todayKST();
  const todayDay = todayDayKST();
  const inputMonth = activityDate.slice(0, 7);
  const todayMonth = today.slice(0, 7);

  if (inputMonth < todayMonth) {
    const isAdmin = await checkIsAdmin(supabase, user.id);
    if (!isAdmin && todayDay > 3) {
      return { error: "전월 기록은 매월 3일까지만 삭제 가능합니다." };
    }
  }

  const { data: existingLog } = await supabase
    .from("activity_log")
    .select("id, participation_id")
    .eq("id", logId)
    .maybeSingle();
  if (!existingLog) return { error: "기록을 찾을 수 없거나 권한이 없습니다." };

  const { error } = await supabase.from("activity_log").delete().eq("id", logId);
  if (error) return { error: "기록 삭제 중 오류가 발생했습니다." };

  revalidatePath("/projects");
  return {};
}

// ── 월별 목표 수정 ─────────────────────────────────────────
export async function updateMonthlyGoal(
  goalId: string,
  newGoal: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const todayDay = todayDayKST();
  const isAdmin = await checkIsAdmin(supabase, user.id);
  if (!isAdmin && todayDay > 14) {
    return { error: "목표는 매월 14일까지만 수정 가능합니다." };
  }

  const { data: existing } = await supabase
    .from("mileage_goal")
    .select("goal_km")
    .eq("id", goalId)
    .single();

  if (!existing) return { error: "목표를 찾을 수 없습니다." };
  if (newGoal < existing.goal_km) {
    return { error: "목표는 현재 값 이상으로만 수정 가능합니다." };
  }

  const { error } = await supabase
    .from("mileage_goal")
    .update({ goal_km: newGoal })
    .eq("id", goalId);

  if (error) return { error: "목표 수정 중 오류가 발생했습니다." };

  revalidatePath("/projects");
  return {};
}

// ── 월별 목표 자동 생성 (lazy) ────────────────────────────
/**
 * 현재 월의 mileage_goal이 없으면 이전 월 달성 여부를 확인하여 자동 생성.
 * 프로젝트 페이지 진입 시 서버 컴포넌트에서 호출한다.
 */
export async function ensureCurrentMonthGoal(
  participationId: string,
  projectEndMonth: string,
): Promise<void> {
  const supabase = await createClient();
  const thisMonth = currentMonthKST();

  // 프로젝트 종료월 이후이면 생성하지 않음
  if (thisMonth > projectEndMonth) return;

  // 이미 당월 목표가 있으면 스킵
  const { data: existing } = await supabase
    .from("mileage_goal")
    .select("id")
    .eq("participation_id", participationId)
    .eq("month", thisMonth)
    .maybeSingle();

  if (existing) return;

  // 이전 월 목표 조회 (가장 최근 것)
  const { data: prevGoal } = await supabase
    .from("mileage_goal")
    .select("goal_km, month")
    .eq("participation_id", participationId)
    .lt("month", thisMonth)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prevGoal) {
    // 이전 목표가 없으면 initial_goal로 첫 목표 생성
    const { data: pp } = await supabase
      .from("project_participation")
      .select("initial_goal")
      .eq("id", participationId)
      .single();
    if (!pp) return;
    await supabase.from("mileage_goal").insert({
      participation_id: participationId,
      month: thisMonth,
      goal_km: pp.initial_goal,
    });
    revalidatePath("/projects");
    return;
  }

  // 이전 월 달성 마일리지 합산
  const prevMonth = prevGoal.month as string;
  const prevMonthEnd = nextMonthStr(prevMonth);
  const { data: logs } = await supabase
    .from("activity_log")
    .select("final_mileage")
    .eq("participation_id", participationId)
    .gte("activity_date", prevMonth)
    .lt("activity_date", prevMonthEnd);

  const achieved = (logs ?? []).reduce(
    (sum, l) => sum + Number(l.final_mileage),
    0,
  );
  const prevGoalKm = Number(prevGoal.goal_km);
  const wasAchieved = achieved >= prevGoalKm;

  const newGoal = calcNextMonthGoal(prevGoalKm, wasAchieved);

  await supabase.from("mileage_goal").insert({
    participation_id: participationId,
    month: thisMonth,
    goal_km: newGoal,
  });
}

/**
 * 프로젝트의 전체 참여자에 대해 당월 목표를 일괄 생성.
 * 프로젝트 페이지 진입 시 호출하여 누구든 접속하면 전원의 목표가 생성됨.
 */
export async function ensureAllCurrentMonthGoals(
  projectId: string,
  projectEndMonth: string,
): Promise<void> {
  const supabase = await createClient();
  const thisMonth = currentMonthKST();

  if (thisMonth > projectEndMonth) return;

  // 해당 월 이전에 참가한 전체 참여자 조회
  const { data: participations } = await supabase
    .from("project_participation")
    .select("id")
    .eq("project_id", projectId)
    .eq("deposit_confirmed", true)
    .lte("start_month", thisMonth);

  if (!participations?.length) return;

  await Promise.all(
    participations.map((p) => ensureCurrentMonthGoal(p.id, projectEndMonth)),
  );
}



// ── 내부 헬퍼 ─────────────────────────────────────────────
async function checkIsAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data: member } = await supabase
    .from("member")
    .select("admin")
    .or(`kakao_user_id.eq.${userId},google_user_id.eq.${userId}`)
    .maybeSingle();
  return member?.admin === true;
}
