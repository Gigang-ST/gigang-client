import { createClient } from "@/lib/supabase/server";
import { toMonthStart, calcMonthRefundRate } from "@/lib/mileage";

const DEPOSIT_PER_MONTH = 10000;

function nextMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const next = new Date(y, m, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function RefundStatus({
  participationId,
  projectId,
}: {
  participationId: string;
  projectId: string;
}) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("project")
    .select("start_month, end_month")
    .eq("id", projectId)
    .single();

  if (!project) return null;

  const { data: goals } = await supabase
    .from("mileage_goal")
    .select("month, goal_km")
    .eq("participation_id", participationId)
    .order("month");

  if (!goals || goals.length === 0) return null;

  const thisMonth = toMonthStart(new Date());
  let confirmedRefund = 0;
  let currentMonthProjected = 0;

  for (const goal of goals) {
    const monthStart = goal.month as string;
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

  return (
    <section className="rounded-xl border p-5 space-y-3">
      <h2 className="font-semibold text-lg">환급 / 회식비</h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">확정 환급액</p>
          <p className="text-xl font-bold">{confirmedRefund.toLocaleString()}원</p>
        </div>
        <div>
          <p className="text-muted-foreground">당월 포함 예상</p>
          <p className="text-xl font-bold">{totalProjected.toLocaleString()}원</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        * 최종 환급은 9월 종료 후 일괄 지급
      </p>
    </section>
  );
}
