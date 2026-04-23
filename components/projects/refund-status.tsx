// 서버 컴포넌트 — 환급/회식비 카드
import { currentMonthKST } from "@/lib/dayjs";
import {
  calcMonthRefundRate,
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE_WITH_SINGLET,
} from "@/lib/mileage";
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-muted/35 px-4 py-3">
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground">환급 예정</p>
          <p className="text-2xl leading-tight font-bold text-foreground">₩0</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground">회식비 지원</p>
          <p className="text-2xl leading-tight font-bold text-foreground">₩0</p>
        </div>
      </div>
    );
  }

  // (mem_id, base_dt) 별 마일리지 합산 맵
  const mileageMap = new Map<string, number>();
  for (const log of allLogs) {
    const goalMonth = (log.act_dt as string).slice(0, 7) + "-01";
    const key = `${log.mem_id}:${goalMonth}`;
    mileageMap.set(key, (mileageMap.get(key) ?? 0) + Number(log.final_mlg));
  }

  // mem_id 별 목표 그룹핑
  const goalsByMem = new Map<
    string,
    { base_dt: string; goal_mlg: number }[]
  >();
  for (const g of allGoals) {
    if (!goalsByMem.has(g.mem_id)) goalsByMem.set(g.mem_id, []);
    goalsByMem.get(g.mem_id)!.push({
      base_dt: g.base_dt as string,
      goal_mlg: Number(g.goal_mlg),
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
      (p.stt_mth as string) > evtStartMonth
        ? (p.stt_mth as string)
        : evtStartMonth;

    if (effectiveStart > viewMonth) continue;

    const participantMonths = countMonths(effectiveStart, viewMonth);
    totalDepositPool += participantMonths * DEPOSIT_PER_MONTH;
    totalShareMonths += participantMonths;

    const goals = goalsByMem.get(p.mem_id) ?? [];
    let participantRefund = 0;

    for (const g of goals) {
      const goalMonth = g.base_dt.slice(0, 7) + "-01";
      if (goalMonth < effectiveStart || goalMonth > viewMonth) continue;
      const key = `${p.mem_id}:${goalMonth}`;
      const achieved = mileageMap.get(key) ?? 0;
      participantRefund +=
        calcMonthRefundRate(achieved, g.goal_mlg) * DEPOSIT_PER_MONTH;
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-muted/35 px-4 py-3">
      <div className="space-y-0.5">
        <p className="text-[11px] text-muted-foreground">환급 예정</p>
        <p className="text-2xl leading-tight font-bold text-foreground">
          {`₩${Math.floor(myRefund).toLocaleString()}`}
        </p>
      </div>
      <div className="space-y-0.5">
        <p className="text-[11px] text-muted-foreground">회식비 지원</p>
        <p className="text-2xl leading-tight font-bold text-foreground">
          {`₩${myPartyBudget.toLocaleString()}`}
        </p>
      </div>
    </div>
  );
}
