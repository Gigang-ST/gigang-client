import { createAdminClient } from "@/lib/supabase/admin";
import { nextMonthStr } from "@/lib/dayjs";
import { MyActivityListClient, type ActivityRecord } from "./my-activity-list-client";

// ─────────────────────────────────────────
// 서버 컴포넌트: 초기 5건 fetch 후 클라이언트 리스트에 전달
// ─────────────────────────────────────────

type Props = {
  evtId: string;
  memId: string;
  /** 'YYYY-MM-01' 형식 */
  month: string;
};

export async function MyActivityList({ evtId, memId, month }: Props) {
  const db = createAdminClient();
  const monthEnd = nextMonthStr(month).slice(0, 7) + "-01"; // 다음달 1일 (exclusive)

  const { data: logs } = await db
    .from("evt_mlg_act_hist")
    .select("act_id, act_dt, sport_cd, distance_km, elevation_m, base_mlg, applied_mults, final_mlg, review")
    .eq("evt_id", evtId)
    .eq("mem_id", memId)
    .gte("act_dt", month)
    .lt("act_dt", monthEnd)
    .order("act_dt", { ascending: false })
    .limit(5);

  const records: ActivityRecord[] = (logs ?? []).map((log) => ({
    act_id: log.act_id,
    act_dt: log.act_dt,
    sport_cd: log.sport_cd,
    distance_km: Number(log.distance_km),
    elevation_m: Number(log.elevation_m),
    base_mlg: Number(log.base_mlg),
    applied_mults: (log.applied_mults ?? []) as { mult_id: string; mult_nm: string; mult_val: number }[],
    final_mlg: Number(log.final_mlg),
    review: log.review ?? null,
  }));

  return (
    <MyActivityListClient
      initialRecords={records}
      evtId={evtId}
      memId={memId}
      month={month}
    />
  );
}
