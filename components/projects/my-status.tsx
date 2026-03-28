import { createClient } from "@/lib/supabase/server";
import {
  currentMonthKST,
  todayKST,
  todayDayKST,
  calcPaceRatio,
  calcDailyNeeded,
  calcMonthRefundRate,
} from "@/lib/mileage";

const DEPOSIT_PER_MONTH = 10000;
const ENTRY_FEE_PER_PERSON = 10000;

function nextMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const next = new Date(y, m, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function MyStatus({
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
  const today = todayKST();
  const todayDay = todayDayKST();
  const thisMonth = month ?? currentMonthKST();
  const isPractice = projectStartMonth ? thisMonth < projectStartMonth : false;

  const { data: goal } = await supabase
    .from("mileage_goal")
    .select("id, goal_km")
    .eq("participation_id", participationId)
    .eq("month", thisMonth)
    .maybeSingle();

  // 목표가 없으면 initial_goal을 fallback으로 사용
  let goalKm = goal?.goal_km ? Number(goal.goal_km) : 0;
  if (!goal) {
    const { data: pp } = await supabase
      .from("project_participation")
      .select("initial_goal")
      .eq("id", participationId)
      .single();
    if (pp) goalKm = pp.initial_goal;
  }

  // 해당 월의 마지막 날 계산
  const [viewY, viewM] = thisMonth.split("-").map(Number);
  const monthLastDay = `${viewY}-${String(viewM).padStart(2, "0")}-${String(new Date(viewY, viewM, 0).getDate()).padStart(2, "0")}`;
  const currentKSTMonth = currentMonthKST();
  const queryEnd = thisMonth <= currentKSTMonth ? monthLastDay : today;

  const { data: logs } = await supabase
    .from("activity_log")
    .select("final_mileage")
    .eq("participation_id", participationId)
    .gte("activity_date", thisMonth)
    .lte("activity_date", queryEnd);

  const currentMileage = (logs ?? []).reduce(
    (sum, l) => sum + Number(l.final_mileage),
    0,
  );

  const now = new Date(thisMonth);
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const progressPct = goalKm > 0 ? Math.min((currentMileage / goalKm) * 100, 100) : 0;
  const paceRatio = calcPaceRatio(currentMileage, goalKm, todayDay, totalDays);
  const dailyNeeded = calcDailyNeeded(currentMileage, goalKm, todayDay, totalDays);

  // ── 환급금 / 회식지원비 계산 (실전 기간만) ──
  let myRefund = 0;
  let myPartyBudget = 0;

  if (!isPractice) {
    const startMonth = projectStartMonth ?? thisMonth;

    // 본인 목표 조회
    const { data: myGoals } = await supabase
      .from("mileage_goal")
      .select("month, goal_km")
      .eq("participation_id", participationId)
      .gte("month", startMonth)
      .order("month");

    for (const g of myGoals ?? []) {
      const mStart = g.month as string;
      if (mStart > thisMonth) continue;
      const mEnd = nextMonth(mStart);

      const { data: mLogs } = await supabase
        .from("activity_log")
        .select("final_mileage")
        .eq("participation_id", participationId)
        .gte("activity_date", mStart)
        .lt("activity_date", mEnd);

      const achieved = (mLogs ?? []).reduce(
        (sum, l) => sum + Number(l.final_mileage),
        0,
      );
      myRefund += calcMonthRefundRate(achieved, Number(g.goal_km)) * DEPOSIT_PER_MONTH;
    }

    // 회식지원비: 전체 참여자 기준 계산
    const { data: allParticipations } = await supabase
      .from("project_participation")
      .select("id, start_month")
      .eq("project_id", projectId)
      .eq("deposit_confirmed", true);

    const participations = allParticipations ?? [];
    const allPIds = participations.map((p) => p.id);

    function countMonths(from: string, to: string): number {
      const [fy, fm] = from.split("-").map(Number);
      const [ty, tm] = to.split("-").map(Number);
      return Math.max((ty - fy) * 12 + (tm - fm) + 1, 0);
    }

    const { data: allGoals } = await supabase
      .from("mileage_goal")
      .select("participation_id, month, goal_km")
      .in("participation_id", allPIds)
      .gte("month", startMonth)
      .order("month");

    const goalsByP = new Map<string, { month: string; goal_km: number }[]>();
    for (const g of allGoals ?? []) {
      const pid = g.participation_id as string;
      if (!goalsByP.has(pid)) goalsByP.set(pid, []);
      goalsByP.get(pid)!.push({ month: g.month as string, goal_km: Number(g.goal_km) });
    }

    let totalDeposits = 0;
    let totalRefunds = 0;
    let totalShareMonths = 0;
    let myShareMonths = 0;
    let activeMemberCountForFee = 0;

    for (const p of participations) {
      const pStart = p.start_month as string;
      if (pStart > thisMonth) continue;
      activeMemberCountForFee++;
      const effectiveStart = pStart < startMonth ? startMonth : pStart;
      const months = countMonths(effectiveStart, thisMonth);
      totalDeposits += months * DEPOSIT_PER_MONTH;
      totalShareMonths += months;
      if (p.id === participationId) myShareMonths = months;

      const pGoals = goalsByP.get(p.id) ?? [];
      for (const g of pGoals) {
        if (g.month > thisMonth) continue;
        const mEnd = nextMonth(g.month);
        const { data: pLogs } = await supabase
          .from("activity_log")
          .select("final_mileage")
          .eq("participation_id", p.id)
          .gte("activity_date", g.month)
          .lt("activity_date", mEnd);

        const achieved = (pLogs ?? []).reduce(
          (sum, l) => sum + Number(l.final_mileage),
          0,
        );
        totalRefunds += calcMonthRefundRate(achieved, g.goal_km) * DEPOSIT_PER_MONTH;
      }
    }

    const partyPool = totalDeposits - totalRefunds + activeMemberCountForFee * ENTRY_FEE_PER_PERSON;
    myPartyBudget = totalShareMonths > 0
      ? Math.floor(partyPool * (myShareMonths / totalShareMonths))
      : 0;
  }

  return (
    <section className="rounded-xl border p-5 space-y-4">
      <h2 className="font-semibold text-lg">내 현황</h2>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">이번달</p>
          <p className="text-xl font-bold">
            {currentMileage.toFixed(1)}
            <span className="text-sm font-normal text-muted-foreground"> / {goalKm.toFixed(0)} km</span>
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">진행률</p>
          <p className="text-xl font-bold">{progressPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">기간 대비</p>
          <p className="text-xl font-bold">{(paceRatio * 100).toFixed(0)}%</p>
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="text-sm text-muted-foreground">
        {dailyNeeded === "done" ? (
          <p className="font-medium text-green-600">이번 달 목표 달성 완료!</p>
        ) : dailyNeeded === 0 ? (
          <p>이번 달이 종료되었습니다.</p>
        ) : (
          <p>
            목표 달성까지 일일{" "}
            <span className="font-semibold text-foreground">
              {(dailyNeeded as number).toFixed(1)} km
            </span>{" "}
            필요
          </p>
        )}
      </div>

      {!isPractice && (
        <div className="border-t pt-4 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">내 환급금</p>
              <p className="text-xl font-bold">
                {Math.floor(myRefund).toLocaleString()}원
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">내 회식지원비</p>
              <p className="text-xl font-bold">
                {myPartyBudget.toLocaleString()}원
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            환급금은 이벤트 종료 후 일괄 환급됩니다.
            <br />
            회식지원금은 예상금액으로 참여인원수에 따라 달라집니다.
          </p>
        </div>
      )}
    </section>
  );
}
