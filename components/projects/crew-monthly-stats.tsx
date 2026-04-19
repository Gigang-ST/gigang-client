import { monthLastDay, nextMonthStr } from "@/lib/dayjs";
import {
  calcMonthRefundRate,
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE_WITH_SINGLET,
} from "@/lib/mileage";
import { StatCard } from "@/components/common/stat-card";
import {
  getEventParticipants,
  getEventGoals,
  getEventLogs,
} from "@/lib/queries/project-data";

type CrewMonthlyStatsProps = {
  evtId: string;
  month: string;
  evtStartMonth: string;
  evtEndMonth: string;
};

export async function CrewMonthlyStats({
  evtId,
  month,
  evtStartMonth,
  evtEndMonth,
}: CrewMonthlyStatsProps) {
  const viewMonth = month > evtEndMonth ? evtEndMonth : month;

  // 공유 캐시 쿼리 (같은 요청 내 다른 컴포넌트와 중복 제거)
  const [allParticipants, allGoals, allLogs] = await Promise.all([
    getEventParticipants(evtId),
    getEventGoals(evtId, evtStartMonth, viewMonth),
    getEventLogs(evtId, evtStartMonth, viewMonth),
  ]);

  // 선택 월 기준 활성 참여자
  const activeParticipants = allParticipants.filter(
    (p) => (p.stt_month as string) <= month,
  );
  if (activeParticipants.length === 0) return null;

  const [y, m] = month.split("-").map(Number);
  const monthEnd = monthLastDay(y, m);
  const nextMonth = nextMonthStr(month);

  // 당월 로그만 필터
  const monthLogs = allLogs.filter(
    (l) => (l.act_dt as string) >= month && (l.act_dt as string) <= monthEnd,
  );

  // 당월 목표만 필터
  const monthGoals = allGoals.filter((g) => g.goal_month === month);

  // 참여자별 당월 마일리지 합산
  const mileageByMem = new Map<string, number>();
  for (const log of monthLogs) {
    mileageByMem.set(
      log.mem_id,
      (mileageByMem.get(log.mem_id) ?? 0) + Number(log.final_mlg),
    );
  }

  // 참여자별 당월 목표 맵
  const goalByMem = new Map<string, number>();
  for (const g of monthGoals) {
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

  const activeMemIds = new Set(activeParticipants.map((p) => p.mem_id));
  for (const log of monthLogs) {
    if (activeMemIds.has(log.mem_id)) {
      totalActivities++;
    }
  }

  const avgMileage =
    participantCount > 0 ? totalMileage / participantCount : 0;

  // 회식비 풀 계산 — 전체 기간 누적 (캐시 데이터 재사용)
  const mlgMap = new Map<string, number>();
  for (const l of allLogs) {
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

    const pGoals = allGoals.filter((g) => g.mem_id === p.mem_id);
    for (const g of pGoals) {
      const key = `${p.mem_id}:${g.goal_month}`;
      const achieved = mlgMap.get(key) ?? 0;
      totalRefundSum +=
        calcMonthRefundRate(achieved, Number(g.goal_val)) * DEPOSIT_PER_MONTH;
    }
  }

  const partyPool =
    totalDepositPool -
    totalRefundSum +
    participantCount * ENTRY_FEE_WITH_SINGLET;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        value={`${achievedCount} / ${participantCount}`}
        label="달성인원 / 참가자수"
      />
      <StatCard value={`${totalMileage.toFixed(0)} km`} label="총 마일리지" />
      <StatCard
        value={`₩${Math.floor(partyPool).toLocaleString()}`}
        label="총 회식비 풀"
      />
      <StatCard
        value={`${avgMileage.toFixed(1)} km`}
        label="평균 마일리지"
      />
    </div>
  );
}
