import { createAdminClient } from "@/lib/supabase/admin";
import { nextMonthStr } from "@/lib/dayjs";
import { type MileageSport } from "@/lib/mileage";
import { MySportChartClient, type SportChartData } from "./my-sport-chart";

// ─────────────────────────────────────────
// 서버 컴포넌트: 데이터 fetch 후 클라이언트 차트에 전달
// ─────────────────────────────────────────

type Props = {
  evtId: string;
  memId: string;
  /** 'YYYY-MM-01' 형식 */
  month: string;
};

export async function MySportChart({ evtId, memId, month }: Props) {
  const db = createAdminClient();
  const monthEnd = nextMonthStr(month).slice(0, 7) + "-01"; // 다음달 1일 (exclusive)

  const { data: logs } = await db
    .from("evt_mlg_act_hist")
    .select("sport_cd, final_mlg")
    .eq("evt_id", evtId)
    .eq("mem_id", memId)
    .gte("act_dt", month)
    .lt("act_dt", monthEnd);

  if (!logs || logs.length === 0) {
    return <MySportChartClient data={[]} />;
  }

  // sport_cd별 final_mlg 합산
  const sportMap = new Map<MileageSport, number>();
  for (const log of logs) {
    const sport = log.sport_cd as MileageSport;
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
