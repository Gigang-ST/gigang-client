import { createClient } from "@/lib/supabase/server";
import {
  toMonthStart,
  todayKST,
  todayDayKST,
  calcPaceRatio,
  calcDailyNeeded,
} from "@/lib/mileage";

export async function MyStatus({ participationId }: { participationId: string }) {
  const supabase = await createClient();
  const today = todayKST();
  const todayDay = todayDayKST();
  const thisMonth = toMonthStart(new Date());

  const { data: goal } = await supabase
    .from("mileage_goal")
    .select("id, goal_km")
    .eq("participation_id", participationId)
    .eq("month", thisMonth)
    .maybeSingle();

  const { data: logs } = await supabase
    .from("activity_log")
    .select("final_mileage")
    .eq("participation_id", participationId)
    .gte("activity_date", thisMonth)
    .lte("activity_date", today);

  const currentMileage = (logs ?? []).reduce(
    (sum, l) => sum + Number(l.final_mileage),
    0,
  );

  const goalKm = goal?.goal_km ? Number(goal.goal_km) : 0;

  const now = new Date(thisMonth);
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const progressPct = goalKm > 0 ? Math.min((currentMileage / goalKm) * 100, 100) : 0;
  const paceRatio = calcPaceRatio(currentMileage, goalKm, todayDay, totalDays);
  const dailyNeeded = calcDailyNeeded(currentMileage, goalKm, todayDay, totalDays);

  return (
    <section className="rounded-xl border p-5 space-y-4">
      <h2 className="font-semibold text-lg">내 현황</h2>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">당월 목표</p>
          <p className="text-xl font-bold">{goalKm.toFixed(0)} km</p>
        </div>
        <div>
          <p className="text-muted-foreground">현재 마일리지</p>
          <p className="text-xl font-bold">{currentMileage.toFixed(1)} km</p>
        </div>
        <div>
          <p className="text-muted-foreground">진행률</p>
          <p className="text-xl font-bold">{progressPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">기간 대비 달성률</p>
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
    </section>
  );
}
