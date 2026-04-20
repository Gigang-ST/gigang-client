// 서버 컴포넌트 — 환급/회식비 카드
import { currentMonthKST } from "@/lib/dayjs";
import {
  calcMonthRefundRate,
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE_WITH_SINGLET,
} from "@/lib/mileage";
import { StatCard } from "@/components/common/stat-card";
import {
  getEventParticipants,
  getEventGoalsCumulative,
  getEventLogsCumulative,
} from "@/lib/queries/project-data";

type RefundStatusProps = {
  evtId: string;
  memId: string;
  evtStartMonth: string;
  evtEndMonth: string;
  month: string;
};

export async function RefundStatus({
  evtId,
  memId,
  evtStartMonth,
  evtEndMonth,
  month,
}: RefundStatusProps) {
  const viewMonth = month > evtEndMonth ? evtEndMonth : month;

  // 공유 캐시 쿼리 (CrewMonthlyStats와 동일 쿼리 → cache hit)
  const [allParticipants, allGoals, allLogs] = await Promise.all([
    getEventParticipants(evtId),
    getEventGoalsCumulative(evtId, evtStartMonth, viewMonth),
    getEventLogsCumulative(evtId, evtStartMonth, viewMonth),
  ]);

  const participants = allParticipants;
  if (participants.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <StatCard value="₩0" label="환급 예정금" />
        <StatCard value="₩0" label="회식비 상한" />
      </div>
    );
  }

  // (mem_id, goal_month) 별 마일리지 합산 맵
  const mileageMap = new Map<string, number>();
  for (const log of allLogs) {
    const goalMonth = (log.act_dt as string).slice(0, 7) + "-01";
    const key = `${log.mem_id}:${goalMonth}`;
    mileageMap.set(key, (mileageMap.get(key) ?? 0) + Number(log.final_mlg));
  }

  // mem_id 별 목표 그룹핑
  const goalsByMem = new Map<
    string,
    { goal_month: string; goal_val: number }[]
  >();
  for (const g of allGoals) {
    if (!goalsByMem.has(g.mem_id)) goalsByMem.set(g.mem_id, []);
    goalsByMem.get(g.mem_id)!.push({
      goal_month: g.goal_month as string,
      goal_val: Number(g.goal_val),
    });
  }

  // 전원 집계
  let totalDepositPool = 0;
  let totalRefundSum = 0;
  let totalShareMonths = 0;
  let myRefund = 0;
  let myShareMonths = 0;

  for (const p of participants) {
    const effectiveStart =
      (p.stt_month as string) > evtStartMonth
        ? (p.stt_month as string)
        : evtStartMonth;

    if (effectiveStart > viewMonth) continue;

    const participantMonths = countMonths(effectiveStart, viewMonth);
    totalDepositPool += participantMonths * DEPOSIT_PER_MONTH;
    totalShareMonths += participantMonths;

    const goals = goalsByMem.get(p.mem_id) ?? [];
    let participantRefund = 0;

    for (const g of goals) {
      if (g.goal_month < effectiveStart || g.goal_month > viewMonth) continue;
      const key = `${p.mem_id}:${g.goal_month}`;
      const achieved = mileageMap.get(key) ?? 0;
      participantRefund +=
        calcMonthRefundRate(achieved, g.goal_val) * DEPOSIT_PER_MONTH;
    }

    totalRefundSum += participantRefund;

    if (p.mem_id === memId) {
      myRefund = participantRefund;
      myShareMonths = participantMonths;
    }
  }

  // 회식비 풀
  const partyPool =
    totalDepositPool -
    totalRefundSum +
    participants.length * ENTRY_FEE_WITH_SINGLET;

  // 1인 회식비 상한
  const myPartyBudget =
    totalShareMonths > 0
      ? Math.floor(partyPool * (myShareMonths / totalShareMonths))
      : 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        value={`₩${Math.floor(myRefund).toLocaleString()}`}
        label="환급 예정금"
      />
      <StatCard
        value={`₩${myPartyBudget.toLocaleString()}`}
        label="회식비 지원금(예상)"
      />
    </div>
  );
}
