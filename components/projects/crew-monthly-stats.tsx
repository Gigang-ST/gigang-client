import { createClient } from "@/lib/supabase/server";
import { todayKST, currentMonthKST, calcMonthRefundRate } from "@/lib/mileage";
import { CrewMonthlyStatsClient } from "./crew-monthly-stats-client";

const DEPOSIT_PER_MONTH = 10000;
const ENTRY_FEE_PER_PERSON = 10000;

function nextMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const next = new Date(y, m, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function CrewMonthlyStats({
  projectId,
  month,
  projectStartMonth,
}: {
  projectId: string;
  month?: string;
  projectStartMonth?: string;
}) {
  const supabase = await createClient();
  const today = todayKST();
  const thisMonth = month ?? currentMonthKST();
  const displayMonth = Number(thisMonth.split("-")[1]);
  const isPractice = projectStartMonth ? thisMonth < projectStartMonth : false;

  // 보증금 확인된 참여자 조회
  const { data: participations } = await supabase
    .from("project_participation")
    .select("id")
    .eq("project_id", projectId)
    .eq("deposit_confirmed", true);

  const members = participations ?? [];
  const totalMembers = members.length;

  if (totalMembers === 0) return null;

  const allPIds = members.map((p) => p.id);

  // 당월 목표 일괄 조회
  const { data: allGoals } = await supabase
    .from("mileage_goal")
    .select("participation_id, goal_km")
    .in("participation_id", allPIds)
    .eq("month", thisMonth);

  // 해당 월 활동 기록 일괄 조회 (해당 월 범위만)
  const [viewY, viewM] = thisMonth.split("-").map(Number);
  const monthLastDay = `${viewY}-${String(viewM).padStart(2, "0")}-${String(new Date(viewY, viewM, 0).getDate()).padStart(2, "0")}`;
  const currentKSTMonth = todayKST().slice(0, 7) + "-01";
  const queryEnd = thisMonth < currentKSTMonth ? monthLastDay : (thisMonth === currentKSTMonth ? today : monthLastDay);

  const { data: allLogs } = await supabase
    .from("activity_log")
    .select("participation_id, final_mileage")
    .in("participation_id", allPIds)
    .gte("activity_date", thisMonth)
    .lte("activity_date", queryEnd);

  // 참여자별 목표 맵
  const goalByPId = new Map<string, number>();
  for (const g of allGoals ?? []) {
    goalByPId.set(g.participation_id as string, Number(g.goal_km));
  }

  // 참여자별 당월 마일리지 합산 맵
  const mileageByPId = new Map<string, number>();
  for (const l of allLogs ?? []) {
    const pid = l.participation_id as string;
    mileageByPId.set(pid, (mileageByPId.get(pid) ?? 0) + Number(l.final_mileage));
  }

  // 해당 월 이전에 참가한 모든 참여자 (initial_goal도 조회)
  const { data: monthParticipations } = await supabase
    .from("project_participation")
    .select("id, initial_goal")
    .eq("project_id", projectId)
    .eq("deposit_confirmed", true)
    .lte("start_month", thisMonth);

  const activeMembers = monthParticipations ?? [];
  const activeMemberCount = activeMembers.length;

  let totalAchievementRate = 0;
  let totalMileage = 0;
  let achievedCount = 0;

  for (const p of activeMembers) {
    const goalKm = goalByPId.get(p.id) ?? p.initial_goal;
    const mileage = mileageByPId.get(p.id) ?? 0;
    const rate = goalKm > 0 ? Math.min(mileage / goalKm, 1) : 0;

    totalAchievementRate += rate;
    totalMileage += mileage;
    if (rate >= 1) achievedCount++;
  }

  const avgRate = activeMemberCount > 0 ? (totalAchievementRate / activeMemberCount) * 100 : 0;
  const avgMileage = activeMemberCount > 0 ? totalMileage / activeMemberCount : 0;

  // 환급/회식비는 실전 기간만
  let totalRefunds = 0;
  let partyPool = 0;
  let totalCollected = 0;

  if (!isPractice) {
    for (const p of activeMembers) {
      const goalKm = goalByPId.get(p.id) ?? p.initial_goal;
      const mileage = mileageByPId.get(p.id) ?? 0;
      const refundRate = calcMonthRefundRate(mileage, goalKm);
      totalRefunds += refundRate * DEPOSIT_PER_MONTH;
    }

    // 회식비 풀 계산
    const { data: allMonthGoals } = await supabase
      .from("mileage_goal")
      .select("participation_id, month, goal_km")
      .in("participation_id", allPIds)
      .lte("month", thisMonth)
      .order("month");

    const goalsByParticipant = new Map<string, { month: string; goal_km: number }[]>();
    for (const g of allMonthGoals ?? []) {
      const pid = g.participation_id as string;
      if (!goalsByParticipant.has(pid)) goalsByParticipant.set(pid, []);
      goalsByParticipant.get(pid)!.push({
        month: g.month as string,
        goal_km: Number(g.goal_km),
      });
    }

    // 참가자별 start_month 조회 (보증금 개월 수 계산용)
    const { data: allStartMonths } = await supabase
      .from("project_participation")
      .select("id, start_month")
      .eq("project_id", projectId)
      .eq("deposit_confirmed", true);

    const startMonthById = new Map<string, string>();
    for (const p of allStartMonths ?? []) {
      startMonthById.set(p.id, p.start_month as string);
    }

    // 두 월 사이의 개월 수 계산 (start_month ~ thisMonth)
    function countMonths(from: string, to: string): number {
      const [fy, fm] = from.split("-").map(Number);
      const [ty, tm] = to.split("-").map(Number);
      return Math.max((ty - fy) * 12 + (tm - fm) + 1, 0);
    }

    let totalDeposits = 0;
    let totalAllRefunds = 0;
    let activeMemberCountForFee = 0;

    for (const p of members) {
      const pStart = startMonthById.get(p.id);
      if (!pStart || pStart > thisMonth) continue;
      activeMemberCountForFee++;
      const effectiveStart = pStart < projectStartMonth! ? projectStartMonth! : pStart;
      const months = countMonths(effectiveStart, thisMonth);
      totalDeposits += months * DEPOSIT_PER_MONTH;

      const pGoals = goalsByParticipant.get(p.id) ?? [];

      for (const goal of pGoals) {
        const monthStart = goal.month;
        const monthEnd = nextMonth(monthStart);

        const { data: logs } = await supabase
          .from("activity_log")
          .select("final_mileage")
          .eq("participation_id", p.id)
          .gte("activity_date", monthStart)
          .lt("activity_date", monthEnd);

        const achieved = (logs ?? []).reduce(
          (sum, l) => sum + Number(l.final_mileage),
          0,
        );
        const rate = calcMonthRefundRate(achieved, goal.goal_km);
        totalAllRefunds += rate * DEPOSIT_PER_MONTH;
      }
    }

    totalCollected = totalDeposits + activeMemberCountForFee * ENTRY_FEE_PER_PERSON;
    totalRefunds = totalAllRefunds;
    partyPool = totalCollected - totalRefunds;
  }

  return (
    <CrewMonthlyStatsClient
      displayMonth={displayMonth}
      isPractice={isPractice}
      activeMemberCount={activeMemberCount}
      avgRate={avgRate}
      avgMileage={avgMileage}
      achievedCount={achievedCount}
      totalRefunds={totalRefunds}
      partyPool={partyPool}
      totalCollected={totalCollected}
    />
  );
}
