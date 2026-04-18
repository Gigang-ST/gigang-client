import { createAdminClient } from "@/lib/supabase/admin";
import { monthLastDay, nextMonthStr } from "@/lib/dayjs";
import { calcMonthRefundRate, countMonths, DEPOSIT_PER_MONTH, ENTRY_FEE_WITH_SINGLET } from "@/lib/mileage";
import { StatCard } from "@/components/common/stat-card";

type CrewMonthlyStatsProps = {
  evtId: string;
  month: string; // "2026-05-01"
  evtStartMonth: string;
  evtEndMonth: string;
};

export async function CrewMonthlyStats({ evtId, month, evtStartMonth, evtEndMonth }: CrewMonthlyStatsProps) {
  const supabase = createAdminClient();

  const [y, m] = month.split("-").map(Number);
  const monthEnd = monthLastDay(y, m);

  // 참여자 + 활동 기록 + 목표 병렬 조회 (async-parallel)
  const [
    { data: participants },
    { data: logs },
    { data: goals },
  ] = await Promise.all([
    supabase
      .from("evt_team_prt_rel")
      .select("mem_id, init_goal, stt_month")
      .eq("evt_id", evtId)
      .eq("approve_yn", true)
      .lte("stt_month", month),
    supabase
      .from("evt_mlg_act_hist")
      .select("mem_id, final_mlg")
      .eq("evt_id", evtId)
      .gte("act_dt", month)
      .lte("act_dt", monthEnd),
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

  // 회식비 풀 계산 (evtStartMonth ~ 선택 월까지 누적)
  const viewMonth = month > evtEndMonth ? evtEndMonth : month;

  // 전체 참여자의 실전 기간 목표/기록 조회 (누적)
  const allMemIds = activeParticipants.map((p) => p.mem_id);
  const [{ data: allGoals }, { data: allLogs }] = await Promise.all([
    supabase
      .from("evt_mlg_goal_cfg")
      .select("mem_id, goal_month, goal_val")
      .eq("evt_id", evtId)
      .in("mem_id", allMemIds)
      .gte("goal_month", evtStartMonth)
      .lte("goal_month", viewMonth),
    supabase
      .from("evt_mlg_act_hist")
      .select("mem_id, act_dt, final_mlg")
      .eq("evt_id", evtId)
      .in("mem_id", allMemIds)
      .gte("act_dt", evtStartMonth)
      .lt("act_dt", nextMonthStr(viewMonth)),
  ]);

  const mlgMap = new Map<string, number>();
  for (const l of allLogs ?? []) {
    const gm = (l.act_dt as string).slice(0, 7) + "-01";
    const key = `${l.mem_id}:${gm}`;
    mlgMap.set(key, (mlgMap.get(key) ?? 0) + Number(l.final_mlg));
  }

  let totalDepositPool = 0;
  let totalRefundSum = 0;

  for (const p of activeParticipants) {
    const effectiveStart =
      (p.stt_month as string) > evtStartMonth
        ? (p.stt_month as string)
        : evtStartMonth;
    if (effectiveStart > viewMonth) continue;
    const months = countMonths(effectiveStart, viewMonth);
    totalDepositPool += months * DEPOSIT_PER_MONTH;

    const pGoals = (allGoals ?? []).filter((g) => g.mem_id === p.mem_id);
    for (const g of pGoals) {
      const key = `${p.mem_id}:${g.goal_month}`;
      const achieved = mlgMap.get(key) ?? 0;
      totalRefundSum += calcMonthRefundRate(achieved, Number(g.goal_val)) * DEPOSIT_PER_MONTH;
    }
  }

  const partyPool = totalDepositPool - totalRefundSum + participantCount * ENTRY_FEE_WITH_SINGLET;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        value={`${achievedCount} / ${participantCount}`}
        label="달성인원 / 참가자수"
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
        value={`₩${Math.floor(partyPool).toLocaleString()}`}
        label="총 회식비 풀"
      />
    </div>
  );
}
