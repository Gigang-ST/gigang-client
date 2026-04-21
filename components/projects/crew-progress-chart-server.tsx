import { daysInMonth as getDaysInMonth, monthLastDay } from "@/lib/dayjs";
import {
  getEventParticipants,
  getEventGoalsMonthly,
  getEventLogsMonthly,
} from "@/lib/queries/project-data";
import { CrewProgressChart } from "./crew-progress-chart";
import type { ChartInitialData, DailyPoint } from "./crew-progress-chart";

type Props = {
  evtId: string;
  memId?: string;
  month: string;
  evtStartMonth: string;
  evtEndMonth: string;
};

export async function CrewProgressChartServer({
  evtId,
  memId,
  month,
}: Props) {
  // 당월 데이터만 조회
  const [allParticipants, allGoals, allLogs] = await Promise.all([
    getEventParticipants(evtId),
    getEventGoalsMonthly(evtId, month),
    getEventLogsMonthly(evtId, month),
  ]);

  // 선택 월 기준 활성 참여자
  const participants = allParticipants.filter(
    (p) => (p.stt_mth as string) <= month,
  );

  if (participants.length === 0) {
    return <CrewProgressChart evtId={evtId} memId={memId} month={month} initialData={null} />;
  }

  const [y, m] = month.split("-").map(Number);
  const totalDays = getDaysInMonth(y, m);
  const mEnd = monthLastDay(y, m);

  // 당월 목표
  const monthGoals = allGoals.filter((g) => g.goal_mth === month);
  const goalByMemId = new Map<string, number>();
  for (const g of monthGoals) {
    goalByMemId.set(g.mem_id, Number(g.goal_val));
  }

  // 당월 로그
  const monthLogs = allLogs.filter(
    (l) => (l.act_dt as string) >= month && (l.act_dt as string) <= mEnd,
  );

  // 본인 정보
  let myGoalKm = 0;
  let myName: string | null = null;
  if (memId) {
    const myP = participants.find((p) => p.mem_id === memId);
    if (myP) {
      myGoalKm = goalByMemId.get(memId) ?? Number(myP.init_goal ?? 0);
      myName = (myP.mem_mst as unknown as { mem_nm: string }).mem_nm;
    }
  }

  // 기록 또는 목표가 있는 참여자만
  const memIdsWithLogs = new Set(monthLogs.map((l) => l.mem_id));
  const activeParticipants = participants.filter(
    (p) =>
      memIdsWithLogs.has(p.mem_id) ||
      goalByMemId.has(p.mem_id) ||
      Number(p.init_goal ?? 0) > 0,
  );

  // 참여자별 일별 누적 마일리지
  const logsByMem = new Map<string, { day: number; val: number }[]>();
  for (const log of monthLogs) {
    const day = Number((log.act_dt as string).split("-")[2]);
    const existing = logsByMem.get(log.mem_id) ?? [];
    existing.push({ day, val: Number(log.final_mlg) });
    logsByMem.set(log.mem_id, existing);
  }

  const dailyCumByMem = new Map<string, Map<number, number>>();
  for (const p of activeParticipants) {
    const entries = logsByMem.get(p.mem_id) ?? [];
    const sorted = [...entries].sort((a, b) => a.day - b.day);
    const dayMap = new Map<number, number>();
    let cum = 0;
    for (const e of sorted) {
      cum += e.val;
      dayMap.set(e.day, Number(cum.toFixed(2)));
    }
    dailyCumByMem.set(p.mem_id, dayMap);
  }

  // 데이터 포인트 생성 (초기 렌더는 마일리지 우선)
  const mileageData: DailyPoint[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const mPoint: DailyPoint = { day: d };

    for (const p of activeParticipants) {
      const dayMap = dailyCumByMem.get(p.mem_id);
      let val = 0;
      if (dayMap) {
        for (let dd = d; dd >= 1; dd--) {
          if (dayMap.has(dd)) {
            val = dayMap.get(dd)!;
            break;
          }
        }
      }
      mPoint[p.mem_id] = Number(val.toFixed(1));
    }

    mileageData.push(mPoint);
  }

  const members = activeParticipants.map((p) => ({
    id: p.mem_id,
    name: (p.mem_mst as unknown as { mem_nm: string }).mem_nm,
    goalKm: goalByMemId.get(p.mem_id) ?? Number(p.init_goal ?? 0),
  }));

  const initialData: ChartInitialData = {
    mileageData,
    percentData: [],
    members,
    myGoalKm,
    myName,
    totalDays,
  };

  return (
    <CrewProgressChart
      evtId={evtId}
      memId={memId}
      month={month}
      initialData={initialData}
    />
  );
}
