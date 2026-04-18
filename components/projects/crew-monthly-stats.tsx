import { createAdminClient } from "@/lib/supabase/admin";
import { todayKST, currentMonthKST, monthLastDay } from "@/lib/dayjs";
import { StatCard } from "@/components/common/stat-card";

type CrewMonthlyStatsProps = {
  evtId: string;
  month: string; // "2026-05-01"
};

export async function CrewMonthlyStats({ evtId, month }: CrewMonthlyStatsProps) {
  const supabase = createAdminClient();

  const today = todayKST();
  const curMonth = currentMonthKST();

  const [y, m] = month.split("-").map(Number);
  const monthEnd = monthLastDay(y, m);

  // 쿼리 종료일: 과거 월이면 말일, 이번 달이면 오늘
  const queryEnd = month < curMonth ? monthEnd : today;

  // 참여자 + 활동 기록 + 목표 병렬 조회 (async-parallel)
  const [
    { data: participants },
    { data: logs },
    { data: goals },
  ] = await Promise.all([
    supabase
      .from("evt_team_prt_rel")
      .select("mem_id, init_goal")
      .eq("evt_id", evtId)
      .eq("approve_yn", true),
    supabase
      .from("evt_mlg_act_hist")
      .select("mem_id, final_mlg")
      .eq("evt_id", evtId)
      .gte("act_dt", month)
      .lte("act_dt", queryEnd),
    supabase
      .from("evt_mlg_goal_cfg")
      .select("mem_id, goal_val")
      .eq("evt_id", evtId)
      .eq("goal_month", month),
  ]);

  const activeParticipants = participants ?? [];
  if (activeParticipants.length === 0) return null;

  // 참여자별 마일리지 합산
  const mileageByMem = new Map<string, number>();
  for (const log of logs ?? []) {
    mileageByMem.set(
      log.mem_id,
      (mileageByMem.get(log.mem_id) ?? 0) + Number(log.final_mlg),
    );
  }

  // 참여자별 목표 맵 (없으면 init_goal 폴백)
  const goalByMem = new Map<string, number>();
  for (const g of goals ?? []) {
    goalByMem.set(g.mem_id, Number(g.goal_val));
  }

  // 통계 계산
  const participantCount = activeParticipants.length;
  let totalMileage = 0;
  let totalActivities = 0;
  let achievedCount = 0;

  for (const p of activeParticipants) {
    const mlg = mileageByMem.get(p.mem_id) ?? 0;
    totalMileage += mlg;

    const goal = goalByMem.get(p.mem_id) ?? Number(p.init_goal ?? 0);
    if (goal > 0 && mlg >= goal) achievedCount++;
  }

  // 활동 건수 (전체 로그 수)
  for (const log of logs ?? []) {
    if (activeParticipants.some((p) => p.mem_id === log.mem_id)) {
      totalActivities++;
    }
  }

  const avgMileage = participantCount > 0 ? totalMileage / participantCount : 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        value={`${participantCount}명`}
        label="참여 인원"
      />
      <StatCard
        value={`${totalMileage.toFixed(0)} km`}
        label="총 마일리지"
      />
      <StatCard
        value={`${avgMileage.toFixed(1)} km`}
        label="평균 마일리지"
      />
      <StatCard
        value={`${achievedCount} / ${participantCount}`}
        label="목표 달성"
      />
    </div>
  );
}
