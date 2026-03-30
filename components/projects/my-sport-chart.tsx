import { createClient } from "@/lib/supabase/server";
import { currentMonthKST, todayKST } from "@/lib/mileage";
import { MySportChartClient } from "./my-sport-chart-client";

export async function MySportChart({
  participationId,
  month,
}: {
  participationId: string;
  month?: string;
}) {
  const supabase = await createClient();
  const today = todayKST();
  const thisMonth = month ?? currentMonthKST();

  const [viewY, viewM] = thisMonth.split("-").map(Number);
  const monthLastDay = `${viewY}-${String(viewM).padStart(2, "0")}-${String(new Date(viewY, viewM, 0).getDate()).padStart(2, "0")}`;
  const currentKSTMonth = todayKST().slice(0, 7) + "-01";
  const queryEnd = thisMonth <= currentKSTMonth ? monthLastDay : today;

  const { data: logs } = await supabase
    .from("activity_log")
    .select("sport, distance_km, elevation_m, base_mileage, final_mileage")
    .eq("participation_id", participationId)
    .gte("activity_date", thisMonth)
    .lte("activity_date", queryEnd);

  if (!logs || logs.length === 0) return null;

  const sportMap = new Map<
    string,
    { baseMileage: number; distanceContrib: number; elevationContrib: number }
  >();
  let totalEventBonus = 0;

  for (const log of logs) {
    const sport = log.sport as string;
    const dist = Number(log.distance_km);
    const elev = Number(log.elevation_m);
    const base = Number(log.base_mileage);
    const final = Number(log.final_mileage);

    // 이벤트 보너스 = final - base
    totalEventBonus += final - base;

    const prev = sportMap.get(sport) ?? {
      baseMileage: 0,
      distanceContrib: 0,
      elevationContrib: 0,
    };

    let distContrib: number;
    let elevContrib: number;
    switch (sport) {
      case "running":
      case "trail_running":
        distContrib = dist;
        elevContrib = elev / 100;
        break;
      case "cycling":
        distContrib = dist / 4;
        elevContrib = elev / 100;
        break;
      case "swimming":
        distContrib = dist * 3;
        elevContrib = 0;
        break;
      default:
        distContrib = base;
        elevContrib = 0;
    }

    sportMap.set(sport, {
      baseMileage: prev.baseMileage + base,
      distanceContrib: prev.distanceContrib + distContrib,
      elevationContrib: prev.elevationContrib + elevContrib,
    });
  }

  const data = Array.from(sportMap.entries()).map(([sport, v]) => ({
    sport,
    mileage: Math.round(v.baseMileage * 10) / 10,
    distanceContrib: Math.round(v.distanceContrib * 10) / 10,
    elevationContrib: Math.round(v.elevationContrib * 10) / 10,
  }));

  const eventBonus = Math.round(totalEventBonus * 10) / 10;

  return <MySportChartClient data={data} eventBonus={eventBonus} />;
}
