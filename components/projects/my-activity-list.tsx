import { nextMonthStr } from "@/lib/dayjs";
import { getEventLogsMonthly } from "@/lib/queries/project-data";
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
  /** 비활성/탈퇴 회원 — true면 수정/삭제 시 공통 안내 게이트를 연다 */
  isInactive?: boolean;
  /** 비활성/탈퇴 세부 구분 — InactiveGateDialog 문구 분기용 */
  inactiveKind?: "inactive" | "left";
};

export async function MyActivityList({
  evtId,
  memId,
  month,
  isInactive = false,
  inactiveKind,
}: Props) {
  const nextMonth = nextMonthStr(month);

  // 당월 로그만 조회
  const allLogs = await getEventLogsMonthly(evtId, month);

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
    sprt_enm: log.sprt_enm as string,
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
      isInactive={isInactive}
      inactiveKind={inactiveKind}
    />
  );
}
