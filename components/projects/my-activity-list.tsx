import { createAdminClient } from "@/lib/supabase/admin";
import { nextMonthStr } from "@/lib/dayjs";
import { MyActivityListClient, type ActivityRecord } from "./my-activity-list-client";

type Props = {
  evtId: string;
  memId: string;
  month: string;
};

export async function MyActivityList({ evtId, memId, month }: Props) {
  const db = createAdminClient();
  const monthEnd = nextMonthStr(month);

  const [{ data: logs }, { count }] = await Promise.all([
    db
      .from("evt_mlg_act_hist")
      .select("act_id, act_dt, sport_cd, distance_km, elevation_m, base_mlg, applied_mults, final_mlg, review")
      .eq("evt_id", evtId)
      .eq("mem_id", memId)
      .gte("act_dt", month)
      .lt("act_dt", monthEnd)
      .order("act_dt", { ascending: false })
      .limit(5),
    db
      .from("evt_mlg_act_hist")
      .select("*", { count: "exact", head: true })
      .eq("evt_id", evtId)
      .eq("mem_id", memId)
      .gte("act_dt", month)
      .lt("act_dt", monthEnd),
  ]);

  const records: ActivityRecord[] = (logs ?? []).map((log) => ({
    act_id: log.act_id,
    act_dt: log.act_dt,
    sport_cd: log.sport_cd,
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
      totalCount={count ?? 0}
    />
  );
}
