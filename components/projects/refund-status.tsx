// 서버 컴포넌트 — 환급/회식비 카드
import { createAdminClient } from "@/lib/supabase/admin";
import { nextMonthStr, currentMonthKST } from "@/lib/dayjs";
import {
  calcMonthRefundRate,
  countMonths,
  DEPOSIT_PER_MONTH,
} from "@/lib/mileage";
import { StatCard } from "@/components/common/stat-card";

type RefundStatusProps = {
  evtId: string;
  memId: string;
  evtStartMonth: string; // "YYYY-MM-01" — 실전 시작 월
  evtEndMonth: string;   // "YYYY-MM-01" — 이벤트 종료 월
  month: string;         // "YYYY-MM-01" — 현재 조회 월
};

export async function RefundStatus({
  evtId,
  memId,
  evtStartMonth,
  evtEndMonth,
  month,
}: RefundStatusProps) {
  const supabase = createAdminClient();
  const curMonth = currentMonthKST();

  // 조회 기준: 이벤트 종료 월까지만 (미래 월도 예상치로 표시)
  const viewMonth = month > evtEndMonth ? evtEndMonth : month;

  // 1. 전체 참여자 조회 (approve_yn=true)
  const { data: allParticipants } = await supabase
    .from("evt_team_prt_rel")
    .select("mem_id, stt_month, deposit_amt, entry_fee_amt")
    .eq("evt_id", evtId)
    .eq("approve_yn", true);

  const participants = allParticipants ?? [];
  if (participants.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <StatCard value="₩0" label="환급 예정금" />
        <StatCard value="₩0" label="회식비 상한" />
      </div>
    );
  }

  const allMemIds = participants.map((p) => p.mem_id);

  // 2. 전체 참여자의 실전 기간 목표 일괄 조회
  const { data: allGoals } = await supabase
    .from("evt_mlg_goal_cfg")
    .select("mem_id, goal_month, goal_val")
    .eq("evt_id", evtId)
    .in("mem_id", allMemIds)
    .gte("goal_month", evtStartMonth)
    .lte("goal_month", viewMonth);

  // 3. 전체 참여자의 실전 기간 활동 기록 일괄 조회
  const { data: allLogs } = await supabase
    .from("evt_mlg_act_hist")
    .select("mem_id, act_dt, final_mlg")
    .eq("evt_id", evtId)
    .in("mem_id", allMemIds)
    .gte("act_dt", evtStartMonth)
    .lt("act_dt", nextMonthStr(viewMonth));

  // (mem_id, goal_month) 별 마일리지 합산 맵
  const mileageMap = new Map<string, number>();
  for (const log of allLogs ?? []) {
    const goalMonth = (log.act_dt as string).slice(0, 7) + "-01";
    const key = `${log.mem_id}:${goalMonth}`;
    mileageMap.set(key, (mileageMap.get(key) ?? 0) + Number(log.final_mlg));
  }

  // mem_id 별 목표 그룹핑
  const goalsByMem = new Map<string, { goal_month: string; goal_val: number }[]>();
  for (const g of allGoals ?? []) {
    if (!goalsByMem.has(g.mem_id)) goalsByMem.set(g.mem_id, []);
    goalsByMem.get(g.mem_id)!.push({
      goal_month: g.goal_month as string,
      goal_val: Number(g.goal_val),
    });
  }

  // 4. 전원 집계
  let totalDepositPool = 0;  // 전체 보증금 합 (실전 참여 개월 × 월 보증금)
  let totalRefundSum = 0;    // 전체 환급액 합
  let totalShareMonths = 0;  // 전체 지분 (참여 개월 수 합)
  let myRefund = 0;          // 본인 환급액
  let myShareMonths = 0;     // 본인 참여 개월 수

  for (const p of participants) {
    // 참여 시작월과 이벤트 실전 시작월 중 늦은 것 기준
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
      participantRefund += calcMonthRefundRate(achieved, g.goal_val) * DEPOSIT_PER_MONTH;
    }

    totalRefundSum += participantRefund;

    if (p.mem_id === memId) {
      myRefund = participantRefund;
      myShareMonths = participantMonths;
    }
  }

  // 5. 회식비 풀 = (전체 보증금 - 전체 환급액) + 참가비(1만원/인 고정, 싱글렛비 제외)
  const partyPool =
    totalDepositPool - totalRefundSum + participants.length * DEPOSIT_PER_MONTH;

  // 6. 1인 회식비 상한 = 풀 × (본인 지분 / 전체 지분)
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
