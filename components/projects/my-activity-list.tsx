import { nextMonthStr } from "@/lib/dayjs";
import { getEventLogs } from "@/lib/queries/project-data";
import {
  MyActivityListClient,
  type ActivityRecord,
} from "./my-activity-list-client";

type Props = {
  evtId: string;
  memId: string;
  month: string;
  evtStartMonth: string;
  evtEndMonth: string;
};

export async function MyActivityList({
  evtId,
  memId,
  month,
  evtStartMonth,
  evtEndMonth,
}: Props) {
  const nextMonth = nextMonthStr(month);
  const viewMonth = month > evtEndMonth ? evtEndMonth : month;

  // 공유 캐시에서 필터
  const allLogs = await getEventLogs(evtId, evtStartMonth, viewMonth);

  const myMonthLogs = allLogs
    .filter(
      (l) =>
        l.mem_id === memId &&
        (l.act_dt as string) >= month &&
        (l.act_dt as string) < nextMonth,
    )
    .sort((a, b) => (b.act_dt as string).localeCompare(a.act_dt as string));

  const totalCount = myMonthLogs.length;
  const top5 = myMonthLogs.slice(0, 5);

  const records: ActivityRecord[] = top5.map((log) => ({
    act_id: log.act_id,
    act_dt: log.act_dt as string,
    sport_cd: log.sport_cd as string,
    distance_km: Number(log.distance_km),
    elevation_m: Number(log.elevation_m),
    base_mlg: Number(log.base_mlg),
    applied_mults: (log.applied_mults ?? []) as ActivityRecord["applied_mults"],
    final_mlg: Number(log.final_mlg),
    review: log.review ?? null,
  }));

  return (
    <MyActivityListClient
      initialRecords={records}
      evtId={evtId}
      memId={memId}
      month={month}
      totalCount={totalCount}
    />
  );
}
