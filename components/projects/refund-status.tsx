import { createClient } from "@/lib/supabase/server";
import { currentMonthKST, calcMonthRefundRate, nextMonthStr as nextMonth, DEPOSIT_PER_MONTH, ENTRY_FEE_PER_PERSON } from "@/lib/mileage";

/**
 * 특정 참여자의 월별 환급액 합산 계산
 * includeCurrentMonth가 true이면 당월 예상분도 포함
 */
async function calcParticipantRefund(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pId: string,
  goals: { month: string; goal_km: number }[],
  thisMonth: string,
  includeCurrentMonth: boolean,
): Promise<number> {
  let total = 0;

  for (const goal of goals) {
    const monthStart = goal.month;
    const isConfirmed = monthStart < thisMonth;
    const isCurrent = monthStart === thisMonth;

    if (!isConfirmed && !(includeCurrentMonth && isCurrent)) continue;

    const monthEnd = nextMonth(monthStart);
    const { data: logs } = await supabase
      .from("activity_log")
      .select("final_mileage")
      .eq("participation_id", pId)
      .gte("activity_date", monthStart)
      .lt("activity_date", monthEnd);

    const achieved = (logs ?? []).reduce(
      (sum, l) => sum + Number(l.final_mileage),
      0,
    );
    const rate = calcMonthRefundRate(achieved, Number(goal.goal_km));
    total += rate * DEPOSIT_PER_MONTH;
  }

  return total;
}

export async function RefundStatus({
  participationId,
  projectId,
  month,
  projectStartMonth,
}: {
  participationId: string;
  projectId: string;
  month?: string;
  projectStartMonth?: string;
}) {
  const supabase = await createClient();
  const currentMonth = month ?? currentMonthKST();
  const isPractice = projectStartMonth ? currentMonth < projectStartMonth : false;

  if (isPractice) {
    return (
      <section className="rounded-xl border p-5">
        <h2 className="font-semibold text-lg">환급 / 회식비</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {Number(currentMonth.split("-")[1])}월은 연습 기간입니다. 환급 및 회식비는 실전 기간(5월~)부터 적용됩니다.
        </p>
      </section>
    );
  }

  const { data: project } = await supabase
    .from("project")
    .select("start_month, end_month")
    .eq("id", projectId)
    .single();

  if (!project) return null;

  // 본인 목표 조회
  const { data: myGoals } = await supabase
    .from("mileage_goal")
    .select("month, goal_km")
    .eq("participation_id", participationId)
    .order("month");

  if (!myGoals || myGoals.length === 0) return null;

  const thisMonth = currentMonth;

  // ── 본인 환급액 계산 (실전 기간만) ──
  const startMonth = projectStartMonth ?? project.start_month;
  let confirmedRefund = 0;
  let currentMonthProjected = 0;

  for (const goal of myGoals) {
    const monthStart = goal.month as string;
    // 연습 기간은 환급 대상 아님
    if (monthStart < (startMonth as string)) continue;
    const monthEnd = nextMonth(monthStart);

    const { data: logs } = await supabase
      .from("activity_log")
      .select("final_mileage")
      .eq("participation_id", participationId)
      .gte("activity_date", monthStart)
      .lt("activity_date", monthEnd);

    const achieved = (logs ?? []).reduce(
      (sum, l) => sum + Number(l.final_mileage),
      0,
    );
    const rate = calcMonthRefundRate(achieved, Number(goal.goal_km));

    if (monthStart < thisMonth) {
      confirmedRefund += rate * DEPOSIT_PER_MONTH;
    } else if (monthStart === thisMonth) {
      currentMonthProjected = rate * DEPOSIT_PER_MONTH;
    }
  }

  const totalProjected = confirmedRefund + currentMonthProjected;

  // ── 회식비 풀 계산 ──
  // 전체 참여자(보증금 확인 완료) 조회
  const { data: allParticipations } = await supabase
    .from("project_participation")
    .select("id")
    .eq("project_id", projectId)
    .eq("deposit_confirmed", true);

  const participations = allParticipations ?? [];
  const totalMembers = participations.length;

  // 전원의 목표 데이터를 한 번에 조회 (실전 기간만)
  const allPIds = participations.map((p) => p.id);
  const { data: allGoals } = await supabase
    .from("mileage_goal")
    .select("participation_id, month, goal_km")
    .in("participation_id", allPIds)
    .gte("month", startMonth as string)
    .order("month");

  // 참여자별 목표 그룹핑
  const goalsByParticipant = new Map<
    string,
    { month: string; goal_km: number }[]
  >();
  for (const g of allGoals ?? []) {
    const pid = g.participation_id as string;
    if (!goalsByParticipant.has(pid)) goalsByParticipant.set(pid, []);
    goalsByParticipant.get(pid)!.push({
      month: g.month as string,
      goal_km: Number(g.goal_km),
    });
  }

  // 참여자별: 참여 개월 수(확정 + 당월) 및 환급액 계산
  let totalDeposits = 0; // 전원의 보증금 합
  let totalRefunds = 0; // 전원의 환급액 합 (당월 포함)
  let totalShareMonths = 0; // 전체 지분(참여 개월 수) 합
  let myShareMonths = 0; // 본인 지분(참여 개월 수)

  for (const p of participations) {
    const pGoals = goalsByParticipant.get(p.id) ?? [];
    // 참여 개월 수 = 확정 월 + 당월 (미래 월 제외)
    const activeMonths = pGoals.filter(
      (g) => g.month <= thisMonth,
    ).length;

    totalDeposits += activeMonths * DEPOSIT_PER_MONTH;
    totalShareMonths += activeMonths;

    if (p.id === participationId) {
      myShareMonths = activeMonths;
    }

    // 참여자별 환급액 계산 (당월 포함)
    const refund = await calcParticipantRefund(
      supabase,
      p.id,
      pGoals,
      thisMonth,
      true,
    );
    totalRefunds += refund;
  }

  // 회식비 풀 = (전원 보증금 - 전원 환급액) + 전원 참가비(1인 1만원)
  const partyPool =
    totalDeposits - totalRefunds + totalMembers * ENTRY_FEE_PER_PERSON;

  // 1인당 회식비 상한 = 풀 x (본인 지분 / 전체 지분 합)
  const myPartyBudget =
    totalShareMonths > 0
      ? Math.floor(partyPool * (myShareMonths / totalShareMonths))
      : 0;

  return (
    <section className="rounded-xl border p-5">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">내 환급금</p>
          <p className="text-xl font-bold">
            {Math.floor(confirmedRefund + currentMonthProjected).toLocaleString()}원
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">내 회식지원비</p>
          <p className="text-xl font-bold">
            {myPartyBudget.toLocaleString()}원
          </p>
        </div>
      </div>
    </section>
  );
}
