import { nextMonthStr } from "@/lib/dayjs";
import type { MileageSport } from "@/lib/mileage";
import { getEventLogsMonthly } from "@/lib/queries/project-data";
import { MySportChartClient } from "./my-sport-chart";
import type { SportChartData } from "./my-sport-chart";

type Props = {
  evtId: string;
  memId: string;
  month: string;
  evtStartMonth: string;
  evtEndMonth: string;
};

export async function MySportChart({
  evtId,
  memId,
  month,
}: Props) {
  const nextMonth = nextMonthStr(month);

  // 당월 로그만 조회
  const allLogs = await getEventLogsMonthly(evtId, month);

  const myMonthLogs = allLogs.filter(
    (l) =>
      l.mem_id === memId &&
      (l.act_dt as string) >= month &&
      (l.act_dt as string) < nextMonth,
  );

  if (myMonthLogs.length === 0) {
    return <MySportChartClient data={[]} />;
  }

  // sprt_enm별 final_mlg 합산
  const sportMap = new Map<MileageSport, number>();
  for (const log of myMonthLogs) {
    const sport = log.sprt_enm as MileageSport;
    const prev = sportMap.get(sport) ?? 0;
    sportMap.set(sport, prev + Number(log.final_mlg));
  }

  const data: SportChartData[] = Array.from(sportMap.entries()).map(
    ([sport, mileage]) => ({
      sport,
      mileage: Math.round(mileage * 100) / 100,
    }),
  );

  return <MySportChartClient data={data} />;
}
