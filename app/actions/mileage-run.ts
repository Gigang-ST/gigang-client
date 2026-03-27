// app/actions/mileage-run.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  type Sport,
  calcBaseMileage,
  calcFinalMileage,
  toMonthStart,
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

  const startMonth = toMonthStart(new Date());

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
    .select("id")
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
    .select("id")
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
